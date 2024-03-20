use dep::aztec::prelude::{
    AztecAddress, NoteInterface, NoteGetterOptions, NoteViewerOptions, NoteHeader, PrivateContext,
    PrivateSet, Map, emit_encrypted_log
};
use dep::aztec::{note::utils::compute_note_hash_for_consumption, hash::pedersen_hash};
use dep::aztec::oracle::{rand::rand, nullifier_key::get_nullifier_secret_key, get_public_key::get_public_key};
use dep::common_types::partition_table::{PartitionTable, PARTITION_TABLE_LEN};

trait OwnedNote {
    fn new(amount: U128, owner: AztecAddress, partition_table: PartitionTable) -> Self;
    fn get_amount(self) -> U128;
    fn get_owner(self) -> AztecAddress;
    // TODO: Move to separate trait
    fn get_partition_table(self) -> PartitionTable;
}

global TOKEN_NOTE_LEN: u64 = 3 + PARTITION_TABLE_LEN;

#[aztec(note)]
struct TokenNote {
    // the amount of tokens in the note
    amount: U128,
    // the provider of secrets for the nullifier. The owner (recipient) to ensure that the note 
    // can be privately spent. When nullifier secret and encryption private key is same 
    // we can simply use the owner for this one.
    owner: AztecAddress,
    // randomness of the note to hide contents.
    randomness: Field,
    // partition table storing merkle hash of the deposit ids contributing to a note
    partition_table: PartitionTable,
}

impl NoteInterface<TOKEN_NOTE_LEN> for TokenNote {
    // docs:start:nullifier
    fn compute_nullifier(self, context: &mut PrivateContext) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = context.request_nullifier_secret_key(self.owner);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ],0)
    }
    // docs:end:nullifier

    fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_consumption(self);
        let secret = get_nullifier_secret_key(self.owner);
        // TODO(#1205) Should use a non-zero generator index.
        pedersen_hash([
            note_hash_for_nullify,
            secret.low,
            secret.high,
        ],0)
    }

    // Broadcasts the note as an encrypted log on L1.
    fn broadcast(self, context: &mut PrivateContext, slot: Field) {
      // We only bother inserting the note if non-empty to save funds on gas.
      if self.amount != U128::from_integer(0) {
          let encryption_pub_key = get_public_key(self.owner);
          emit_encrypted_log(
              context,
              (*context).this_address(),
              slot,
              Self::get_note_type_id(),
              encryption_pub_key,
              self.serialize_content(),
          );
      }
    }
}

impl OwnedNote for TokenNote {
    fn new(amount: U128, owner: AztecAddress, partition_table: PartitionTable) -> Self {
        Self {
            amount,
            owner,
            randomness: rand(),
            partition_table,
            header: NoteHeader::empty(),
        }
    }

    fn get_amount(self) -> U128 {
        self.amount
    }

    fn get_owner(self) -> AztecAddress {
        self.owner
    }

    fn get_partition_table(self) -> PartitionTable {
        self.partition_table
    }
}
