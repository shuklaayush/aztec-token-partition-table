use dep::protocol_types::{
    address::AztecAddress,
    constants::{
        MAX_READ_REQUESTS_PER_CALL
    },
};
use dep::aztec::{
    note::{
        note_header::NoteHeader,
        note_interface::NoteInterface,
        utils::compute_note_hash_for_read_or_nullify,
    },
    context::PrivateContext,
    state_vars::set::Set,
    log::emit_encrypted_log,
    hash::pedersen_hash,
};
use dep::aztec::oracle::{
    rand::rand,
    get_secret_key::get_secret_key,
    get_public_key::get_public_key,
};
use dep::safe_math::SafeU120;
use dep::std::option::Option;

use crate::types::partition_table::{PartitionTable, PARTITION_TABLE_LEN};
use crate::types::bounded_vec::BoundedVec;

global TOKEN_NOTE_LEN: Field = 28; // 3 + 24 (PT) plus a header.

struct TokenNote {
    // the amount of tokens in the note
    amount: SafeU120,
    // the provider of secrets for the nullifier. The owner (recipient) to ensure that the note 
    // can be privately spent. When nullifier secret and encryption private key is same 
    // we can simply use the owner for this one.
    owner: AztecAddress,
    // randomness of the note to hide contents.
    randomness: Field,
    // partition table storing merkle hash of the deposit ids contributing to a note
    partition_table: PartitionTable,
    // the note header (contract_address, nonce, storage_slot)
    // included in the note such that it becomes part of encrypted logs for later use.
    header: NoteHeader,
}

impl TokenNote {
    pub fn empty() -> Self {
        Self {
            amount: SafeU120::new(0),
            owner: AztecAddress::empty(),
            randomness: rand(),
            partition_table: PartitionTable::empty(),
            header: NoteHeader::empty(),
        }
    }

    pub fn new(amount: SafeU120, owner: AztecAddress, partition_table: PartitionTable) -> Self {
        Self {
            amount,
            owner,
            randomness: rand(),
            partition_table,
            header: NoteHeader::empty(),
        }
    }

    pub fn serialize(self) -> [Field; TOKEN_NOTE_LEN] {
        let mut serialized_note = [0; TOKEN_NOTE_LEN];
        serialized_note[0] = self.amount.value as Field;
        serialized_note[1] = self.owner.to_field();
        serialized_note[2] = self.randomness;

        let partition_table_serialized = self.partition_table.serialize();
        for i in 0..PARTITION_TABLE_LEN {
            serialized_note[i + 3] = partition_table_serialized[i];
        }

        serialized_note
    }

    pub fn deserialize(serialized_note: [Field; TOKEN_NOTE_LEN]) -> Self {
        let mut partition_table_serialized = [0; PARTITION_TABLE_LEN];
        for i in 0..PARTITION_TABLE_LEN {
            partition_table_serialized[i] = serialized_note[i + 3];
        }
        Self {
            amount: SafeU120::new(serialized_note[0]),
            owner: AztecAddress::from_field(serialized_note[1]),
            randomness: serialized_note[2],
            partition_table: PartitionTable::deserialize(partition_table_serialized),
            header: NoteHeader::empty(),
        }
    }

    pub fn compute_note_hash(self) -> Field {
        // TODO(#1205) Should use a non-zero generator index.
        let serialized_note = self.serialize();
        pedersen_hash(serialized_note, 0)
    }

    // docs:start:nullifier
    pub fn compute_nullifier(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_read_or_nullify(TokenNoteMethods, self);
        let secret = get_secret_key(self.owner);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ],0)
    }
    // docs:end:nullifier

    pub fn set_header(&mut self, header: NoteHeader) {
        self.header = header;
    }

    // Broadcasts the note as an encrypted log on L1.
    pub fn broadcast(self, context: &mut PrivateContext, slot: Field) {
      // We only bother inserting the note if non-empty to save funds on gas.
      if !self.amount.is_zero() {
          let encryption_pub_key = get_public_key(self.owner);
          emit_encrypted_log(
              context,
              (*context).this_address(),
              slot,
              encryption_pub_key,
              self.serialize(),
          );
      }
  }
}

fn deserialize(serialized_note: [Field; TOKEN_NOTE_LEN]) -> TokenNote {
    TokenNote::deserialize(serialized_note)
}

fn serialize(note: TokenNote) -> [Field; TOKEN_NOTE_LEN] {
    note.serialize()
}

fn compute_note_hash(note: TokenNote) -> Field {
    note.compute_note_hash()
}

fn compute_nullifier(note: TokenNote) -> Field {
    note.compute_nullifier()
}

fn get_header(note: TokenNote) -> NoteHeader {
    note.header
}

fn set_header(note: &mut TokenNote, header: NoteHeader) {
    note.set_header(header)
}

// Broadcasts the note as an encrypted log on L1.
fn broadcast(context: &mut PrivateContext, slot: Field, note: TokenNote) {
    note.broadcast(context, slot);
}

global TokenNoteMethods = NoteInterface {
    deserialize,
    serialize,
    compute_note_hash,
    compute_nullifier,
    get_header,
    set_header,
    broadcast,
};
