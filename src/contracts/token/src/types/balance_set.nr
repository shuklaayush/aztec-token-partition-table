use dep::std::option::Option;
use dep::safe_math::SafeU120;
use dep::protocol_types::{
    constants::MAX_READ_REQUESTS_PER_CALL,
};
use dep::aztec::{
  context::Context,
  state_vars::set::Set,
};
use dep::aztec::note::{
    note_getter::view_notes,
    note_getter_options::{NoteGetterOptions, SortOrder},
    note_viewer_options::NoteViewerOptions
};
use dep::aztec::note::{
    note_header::NoteHeader,
    note_interface::NoteInterface,
    utils::compute_note_hash_for_read_or_nullify,
};
use dep::aztec::oracle::{
    rand::rand,
    get_secret_key::get_secret_key,
    get_public_key::get_public_key,
};
use dep::protocol_types::address::AztecAddress;
use dep::common_types::partition_table::PartitionTable;

use crate::types::token_note::{TokenNote, TOKEN_NOTE_LEN, TokenNoteMethods};

// A set implementing standard manipulation of balances.
// Does not require spending key, but only knowledge.
// Spending key requirement should be enforced by the contract using this.
struct BalanceSet {
  context: Context,
  owner: AztecAddress,
  set: Set<TokenNote, TOKEN_NOTE_LEN>
}

impl BalanceSet {
  pub fn new(context: Context, owner: AztecAddress, storage_slot: Field) -> Self {
    assert(storage_slot != 0, "Storage slot 0 not allowed. Storage slots must start from 1.");
    let set = Set {
        context,
        storage_slot,
        note_interface: TokenNoteMethods,
    };
    Self {
        context,
        owner,
        set,
    }
  }

  unconstrained pub fn balance_of(self: Self) -> SafeU120 {
    self.balance_of_with_offset(0)
  }

  unconstrained pub fn balance_of_with_offset(self: Self, offset: u32) -> SafeU120 {
      // Same as SafeU120::new(0), but fewer constraints because no check. 
      let mut balance = SafeU120::min();
      // docs:start:view_notes
      let options = NoteViewerOptions::new().set_offset(offset);
      let opt_notes = self.set.view_notes(options);
      // docs:end:view_notes
      let len = opt_notes.len();
      for i in 0..len {
          if opt_notes[i].is_some() {
              balance = balance.add(opt_notes[i].unwrap_unchecked().amount);
          }
      }
      if (opt_notes[len - 1].is_some()) {
          balance = balance.add(self.balance_of_with_offset(offset + opt_notes.len() as u32));
      }

      balance
    }

    unconstrained pub fn has_attestation(self: Self, attestor: AztecAddress) -> bool {
        let options = NoteViewerOptions::new();
        let maybe_notes = self.set.view_notes(options);
        let mut res = false;
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                let attestations = maybe_notes[i].unwrap_unchecked().partition_table.attestations;
                res = attestations.contains(attestor.to_field());
            }
        }
        res
    }

    unconstrained pub fn last_unattested_note_unc(self: Self, attestor: AztecAddress) -> Option<TokenNote> {
        let options = NoteViewerOptions::new();
        let maybe_notes = self.set.view_notes(options);

        let mut selected = Option::none();
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                let attestations = maybe_notes[i].unwrap_unchecked().partition_table.attestations;
                if !attestations.contains(attestor.to_field()) {
                    selected = maybe_notes[i];
                }
            }
        }
        selected
    }

    pub fn last_unattested_note(self: Self, attestor: AztecAddress) -> Option<TokenNote> {
        let options = NoteGetterOptions::with_filter(filter_notes_unattested, attestor);
        let maybe_notes = self.set.get_notes(options);

        let mut selected = Option::none();
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                selected = maybe_notes[i];
            }
        }
        selected
    }

    pub fn add_attestation(self: Self, note: TokenNote, attestor: AztecAddress) {
        let shield_ids = note.partition_table.shield_ids;
        let mut attestations = note.partition_table.attestations;
        let attestations = attestations.push(attestor.to_field());
        let partition_table = PartitionTable::new(shield_ids, attestations);

        let mut new_note = TokenNote::new(note.amount, self.owner, partition_table);

        self.set.remove(note);
        self.set.insert(&mut new_note, true);
    }

    pub fn add(self: Self, addend: SafeU120) {
        let mut addend_note = TokenNote::new(addend, self.owner, PartitionTable::empty());

        // docs:start:insert
        self.set.insert(&mut addend_note, true);
        // docs:end:insert
    }

    pub fn sub(self: Self, subtrahend: SafeU120) {
        // docs:start:get_notes
        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, subtrahend);
        let maybe_notes = self.set.get_notes(options);
        // docs:end:get_notes

        let mut minuend: SafeU120 = SafeU120::min();
        for i in 0..maybe_notes.len() {
            if maybe_notes[i].is_some() {
                let note = maybe_notes[i].unwrap_unchecked();

                // Removes the note from the owner's set of notes.
                // This will call the the `compute_nullifer` function of the `token_note`
                // which require knowledge of the secret key (currently the users encryption key).
                // The contract logic must ensure that the spending key is used as well.
                // docs:start:remove
                self.set.remove(note);
                // docs:end:remove

                minuend = minuend.add(note.amount);
            }
        }

        // This is to provide a nicer error msg,
        // without it minuend-subtrahend would still catch it, but more generic error then.
        // without the == true, it includes 'minuend.ge(subtrahend)' as part of the error.
        assert(minuend.ge(subtrahend) == true, "Balance too low");

        self.add(minuend.sub(subtrahend));
    }
}

pub fn filter_notes_min_sum(
    notes: [Option<TokenNote>; MAX_READ_REQUESTS_PER_CALL],
    min_sum: SafeU120
) -> [Option<TokenNote>; MAX_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_READ_REQUESTS_PER_CALL];
    let mut sum = SafeU120::min();
    for i in 0..notes.len() {
        if notes[i].is_some() & sum.lt(min_sum) {
            let note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(note);
            sum = sum.add(note.amount);
        }
    }
    selected
}

pub fn filter_notes_unattested(
    notes: [Option<TokenNote>; MAX_READ_REQUESTS_PER_CALL],
    attestor: AztecAddress
) -> [Option<TokenNote>; MAX_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_READ_REQUESTS_PER_CALL];
    for i in 0..notes.len() {
        if notes[i].is_some() {
            let attestations = notes[i].unwrap_unchecked().partition_table.attestations;
            if !attestations.contains(attestor.to_field()) {
                selected[i] = notes[i];
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
