use dep::aztec::{
    note::{
        note_header::NoteHeader,
        note_interface::NoteInterface,
        utils::compute_note_hash_for_read_or_nullify,
    },
    hash::pedersen_hash,
    context::PrivateContext,
    log::emit_encrypted_log,
};
use dep::aztec::oracle::{
    get_secret_key::get_secret_key,
    get_public_key::get_public_key,
};

global MAX_SHIELD_IDS_LEN: Field = 10;
// TODO: No hardcode
global BLACKLIST_NOTE_LEN: Field = 11;

struct BlacklistNote {
    count: u32,
    // TODO: Change to indexed merkle root
    shield_ids: [u32; MAX_SHIELD_IDS_LEN],
    // TODO: Do I need an owner?
    // owner: AztecAddress,
    // the note header (contract_address, nonce, storage_slot)
    // included in the note such that it becomes part of encrypted logs for later use.
    header: NoteHeader,
}

impl BlacklistNote{
    pub fn new(count: u32, shield_ids: [u32; MAX_SHIELD_IDS_LEN]) -> Self {
        Self {
            count,
            shield_ids,
            header: NoteHeader::empty(),
        }
    }

    pub fn empty() -> Self {
        Self {
            count: 0,
            shield_ids: [0; MAX_SHIELD_IDS_LEN],
            header: NoteHeader::empty(),
        }
    }

    pub fn serialize(self) -> [Field; BLACKLIST_NOTE_LEN] {
        let mut serialized_note = [0 as Field; BLACKLIST_NOTE_LEN];
        serialized_note[0] = self.count as Field;
        for i in 0..MAX_SHIELD_IDS_LEN {
            serialized_note[i + 1] = self.shield_ids[i] as Field;
        }
        serialized_note
    }

    pub fn deserialize(serialized_note: [Field; BLACKLIST_NOTE_LEN]) -> Self {
        Self {
            count: serialized_note[0] as u32,
            // TODO
            shield_ids: [0; MAX_SHIELD_IDS_LEN],
            header: NoteHeader::empty(),
        }
    }

    pub fn compute_note_hash(self) -> Field {
        // TODO(#1205) Should use a non-zero generator index.
        let serialized_note = self.serialize();
        pedersen_hash(serialized_note, 0)
    }

    pub fn compute_nullifier(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_read_or_nullify(BlacklistNoteMethods, self);
        // let secret = get_secret_key(self.owner.address);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            // secret.low,
            // secret.high,
        ],0)
    }

    pub fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }

    // Broadcasts the note as an encrypted log on L1.
    pub fn broadcast(self, context: &mut PrivateContext, slot: Field) {
      // We only bother inserting the note if non-empty to save funds on gas.
      // TODO: Do I need a secret log?
      // if self.count > 0 {
      //     let encryption_pub_key = get_public_key(self.owner.address);
      //     emit_encrypted_log(
      //         context,
      //         (*context).this_address(),
      //         slot,
      //         encryption_pub_key,
      //         self.serialize(),
      //     );
      // }
    }
}

fn deserialize(serialized_note: [Field; BLACKLIST_NOTE_LEN]) -> BlacklistNote {
    BlacklistNote::deserialize(serialized_note)
}

fn serialize(note: BlacklistNote) -> [Field; BLACKLIST_NOTE_LEN] {
    note.serialize()
}

fn compute_note_hash(note: BlacklistNote) -> Field {
    note.compute_note_hash()
}

fn compute_nullifier(note: BlacklistNote) -> Field {
    note.compute_nullifier()
}

fn get_header(note: BlacklistNote) -> NoteHeader {
    note.header
}

fn set_header(note: &mut BlacklistNote, header: NoteHeader) {
    note.set_header(header)
}

// Broadcasts the note as an encrypted log on L1.
fn broadcast(context: &mut PrivateContext, slot: Field, note: BlacklistNote) {
    note.broadcast(context, slot);
}

global BlacklistNoteMethods = NoteInterface {
    deserialize,
    serialize,
    compute_note_hash,
    compute_nullifier,
    get_header,
    set_header,
    broadcast,
};

