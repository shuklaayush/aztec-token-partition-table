use dep::aztec::prelude::{
    AztecAddress, NoteGetterOptions, NoteViewerOptions, NoteHeader, NoteInterface, PrivateContext,
    PrivateSet, Map, emit_encrypted_log
};
use dep::aztec::{
    context::{PublicContext, Context}, hash::pedersen_hash,
    protocol_types::constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    note::{note_getter::view_notes, note_getter_options::SortOrder}
};
use dep::common_types::partition_table::PartitionTable;
use crate::types::token_note::{TokenNote, OwnedNote};

struct BalancesMap<T> {
    map: Map<AztecAddress, PrivateSet<T>>
}

impl<T> BalancesMap<T> {
    pub fn new(context: Context, storage_slot: Field) -> Self {
        assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
        Self {
            map: Map::new(
                context,
                storage_slot,
                |context, slot| PrivateSet::new(context, slot)
            )
        }
    }

    unconstrained pub fn balance_of<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress
    ) -> U128 where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        self.balance_of_with_offset(owner, 0)
    }

    unconstrained pub fn balance_of_with_offset<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        offset: u32
    ) -> U128 where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        // Same as U128::new(0), but fewer constraints because no check. 
        let mut balance = U128::from_integer(0);
        // docs:start:view_notes
        let options = NoteViewerOptions::new().set_offset(offset);
        let opt_notes = self.map.at(owner).view_notes(options);
        // docs:end:view_notes
        let len = opt_notes.len();
        for i in 0..len {
            if opt_notes[i].is_some() {
                balance = balance + opt_notes[i].unwrap_unchecked().get_amount();
            }
        }
        if (opt_notes[len - 1].is_some()) {
            balance = balance + self.balance_of_with_offset(owner, offset + opt_notes.len() as u32);
        }

        balance
    }

    // At least one note has attestation.
    unconstrained pub fn has_attestation<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        attestor: AztecAddress
    ) -> bool where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        let options = NoteViewerOptions::new();
        let maybe_notes = self.map.at(owner).view_notes(options);
        let mut res = false;
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                let attestations = maybe_notes[i].unwrap_unchecked().get_partition_table().attestations;
                res = attestations.contains(attestor.to_field());
            }
        }
        res
    }

    unconstrained pub fn last_unattested_note_unc<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        attestor: AztecAddress
    ) -> Option<T> where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        let options = NoteViewerOptions::new();
        let maybe_notes = self.map.at(owner).view_notes(options);

        let mut selected = Option::none();
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                let attestations = maybe_notes[i].unwrap_unchecked().get_partition_table().attestations;
                if !attestations.contains(attestor.to_field()) {
                    selected = maybe_notes[i];
                }
            }
        }
        selected
    }

    pub fn last_unattested_note<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        attestor: AztecAddress
    ) -> Option<T> where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        let options = NoteGetterOptions::with_filter(filter_notes_unattested, attestor);
        let maybe_notes = self.map.at(owner).get_notes(options);

        let mut selected = Option::none();
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                selected = maybe_notes[i];
            }
        }
        selected
    }

    pub fn add_attestation<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        note: T,
        attestor: AztecAddress
    ) where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        let shield_ids = note.get_partition_table().shield_ids;
        let mut attestations = note.get_partition_table().attestations;
        attestations.push(attestor.to_field());
        let partition_table = PartitionTable::new(shield_ids, attestations);

        let mut new_note = T::new(note.get_amount(), owner, partition_table);

        self.map.at(owner).remove(note);
        self.map.at(owner).insert(&mut new_note, true);
    }

    pub fn add<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        addend: U128,
        pt: PartitionTable
    ) where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        let mut addend_note = T::new(addend, owner, pt);

        // docs:start:insert
        self.map.at(owner).insert(&mut addend_note, true);
        // docs:end:insert
    }

    pub fn sub<T_SERIALIZED_LEN>(
        self: Self,
        owner: AztecAddress,
        subtrahend: U128
    ) -> PartitionTable where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
        // docs:start:get_notes
        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend);
        let maybe_notes = self.map.at(owner).get_notes(options);
        // docs:end:get_notes

        let mut pt1 = PartitionTable::default();
        let mut pt2 = PartitionTable::default();
        let mut minuend: U128 = U128::from_integer(0);
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                let note = maybe_notes[i].unwrap_unchecked();

                // Removes the note from the owner's set of notes.
                // This will call the the `compute_nullifer` function of the `token_note`
                // which require knowledge of the secret key (currently the users encryption key).
                // The contract logic must ensure that the spending key is used as well.
                // docs:start:remove
                self.map.at(owner).remove(note);
                // docs:end:remove

                pt1 = pt1.join(note.get_partition_table());
                pt2 = note.get_partition_table();

                minuend = minuend + note.get_amount();
            }
        }

        // This is to provide a nicer error msg,
        // without it minuend-subtrahend would still catch it, but more generic error then.
        // without the == true, it includes 'minuend.ge(subtrahend)' as part of the error.
        assert(minuend >= subtrahend == true, "Balance too low");
        // TODO: Getting this error with the following lines
        //       entered unreachable code: Cannot flatten a dynamic array
        // let diff = minuend.sub(subtrahend);
        // if diff.gt(U128::min()) {
        self.add(owner, minuend - subtrahend, pt2);
        // }

        pt1
    }
}

pub fn filter_notes_min_sum<T, T_SERIALIZED_LEN>(
    notes: [Option<T>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: U128
) -> [Option<T>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    let mut sum = U128::from_integer(0);
    for i in 0..notes.len() {
        if notes[i].is_some() & sum < min_sum {
            let note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(note);
            sum = sum.add(note.get_amount());
        }
    }
    selected
}

pub fn filter_notes_unattested<T, T_SERIALIZED_LEN>(
    notes: [Option<T>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    attestor: AztecAddress
) -> [Option<T>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] where T: NoteInterface<T_SERIALIZED_LEN> + OwnedNote {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];
    for i in 0..notes.len() {
        if notes[i].is_some() {
            let note = notes[i].unwrap_unchecked();
            // TODO: Ideally notes wouldn't contain empty notes
            if note.get_amount() > U128::from_integer(0) {
                let attestations = notes[i].unwrap_unchecked().get_partition_table().attestations;
                if !attestations.contains(attestor.to_field()) {
                    selected[i] = notes[i];
                }
            }
        }
    }
    selected
}

// TODO: Unconstrained
pub fn contains<N>(arr: [AztecAddress; N], addr: AztecAddress) -> bool {
    let mut res = false;
    for i in 0..arr.len() {
        if arr[i].eq(addr) {
            res = true;
        }
    }
    res
}
