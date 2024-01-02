// TODO: Attestor contract
//       The Attestor contract tracks blacklisted deposit IDs. 
//       Attestations are dispensed if a note’s partition table does not intersect with the blacklist.
//
//       The blacklist must be accessible from private functions. A possible solution is to store the blacklist as an indexed merkle tree. 
//       Race conditions that arise from updating the tree can be deferred and considered out-of-scope for the MPV.
//
//       The request_attestation method requires a set-non-intersection check that is of independent interest and should be implemented as a 3rd party library.

mod types;

contract Attestor {
    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        note::{
            note_header::NoteHeader,
            utils as note_utils
        },
        state_vars::{map::Map, singleton::Singleton ,public_state::PublicState},
        types::type_serialization::{
            aztec_address_serialization::{AztecAddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN},
        },
        types::address::AztecAddress,
    };
    
    use crate::types::blacklist_note::{BlacklistNote, BlacklistNoteMethods, BLACKLIST_NOTE_LEN};

    struct Storage {
        admin: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,
        blacklisted: Map<Singleton<BlacklistNote, BLACKLIST_NOTE_LEN>>,
    }

    impl Storage {
        fn init(context: Context) -> Self {
            Storage {
                admin: PublicState::new(
                    context,
                    1,
                    AztecAddressSerializationMethods,
                ),
                // Token address -> BlacklistNote
                blacklisted: Map::new(
                    context,
                    2,
                    |context, slot| {
                        Singleton::new(context, slot, BlacklistNoteMethods)
                    },
                ),
            }
        }
    }

    // TODO: Make private?
    #[aztec(public)]
    fn constructor(admin: AztecAddress) {
        storage.admin.write(admin);
    }
    
    #[aztec(public)]
    pub fn add_to_blacklist(token_address: AztecAddress, shield_id: u32) {
        assert(storage.admin.read().eq(AztecAddress::new(context.msg_sender())), "caller is not admin");

        let mut note = storage.blacklisted.at(token_address.address).get_note(false);
        note.shield_ids[note.count] = shield_id;
        note.count += 1;

        storage.blacklisted.at(token_address.address).replace(&mut note, true);
    }

    // TODO
    // #[aztec(public)]
    // pub fn remove_from_blacklist(token_address: AztecAddress, shield_id: u32) {
    //     storage.blacklisted.at(shield_id as Field).write(false);
    // }

    // #[aztec(private)]
    // fn request_attestation(table: PartitionTable, attestor: AztecAddress) -> bool {
    //     // TODO: Do a non-intersection check between the partition table and the blacklist
    // }

    // TODO 
    unconstrained fn compute_note_hash_and_nullifier(
        contract_address: Field,
        nonce: Field,
        storage_slot: Field,
        serialized_note: [Field; BLACKLIST_NOTE_LEN]
    ) -> [Field; 4] {
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        note_utils::compute_note_hash_and_nullifier(BlacklistNoteMethods, note_header, serialized_note)
    }
}
