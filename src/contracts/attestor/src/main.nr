// TODO: Attestor contract
//       The Attestor contract tracks blacklisted deposit IDs. 
//       Attestations are dispensed if a note’s partition table does not intersect with the blacklist.
//
//       The blacklist must be accessible from private functions. A possible solution is to store the blacklist as an indexed merkle tree. 
//       Race conditions that arise from updating the tree can be deferred and considered out-of-scope for the MPV.
//
//       The request_attestation method requires a set-non-intersection check that is of independent interest and should be implemented as a 3rd party library.

mod types;
mod utils;

global MAX_SHIELD_IDS_LEN: Field = 10;

contract Attestor {
    ////////////////////////////////////////////////////////////////////////////////
    // IMPORTS
    ////////////////////////////////////////////////////////////////////////////////

    use dep::aztec::{
        context::Context,
        note::{
            note_header::NoteHeader,
            utils as note_utils
        },
        selector::compute_selector,
        state_vars::{map::Map, public_state::PublicState},
        types::type_serialization::{
            aztec_address_serialization::{AztecAddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN},
            field_serialization::{FieldSerializationMethods, FIELD_SERIALIZED_LEN},
        },
        types::address::AztecAddress,
    };
    
    use crate::types::{blacklist::Blacklist, type_serialization::blacklist_serialization::{BLACKLIST_SERIALIZED_LEN, BlacklistSerializationMethods}};

    ////////////////////////////////////////////////////////////////////////////////
    // STORAGE
    ////////////////////////////////////////////////////////////////////////////////

    struct Storage {
        admin: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,
        blacklists: Map<PublicState<Blacklist, BLACKLIST_SERIALIZED_LEN>>,
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
                blacklists: Map::new(
                    context,
                    2,
                    |context, slot| {
                        PublicState::new(
                            context,
                            slot,
                            BlacklistSerializationMethods,
                        )
                    },
                ),
            }
        }
    }

    ////////////////////////////////////////////////////////////////////////////////
    // CONSTRUCTOR
    ////////////////////////////////////////////////////////////////////////////////

    // TODO: Make private?
    #[aztec(private)]
    fn constructor(admin: AztecAddress) {
        let selector = compute_selector("_initialize((Field))");
        context.call_public_function(context.this_address(), selector, [admin.address]);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // PUBLIC
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(public)]
    pub fn add_to_blacklist(token: AztecAddress, shield_id: Field) {
        assert(storage.admin.read().eq(AztecAddress::new(context.msg_sender())), "caller is not admin");

        let mut blacklist = storage.blacklists.at(token.address).read();
        let blacklist = blacklist.add(shield_id);
        storage.blacklists.at(token.address).write(blacklist);
    }

    // TODO
    // #[aztec(public)]
    // pub fn remove_from_blacklist(token_address: AztecAddress, shield_id: Field) {
    //     storage.blacklisted.at(shield_id).write(false);
    // }

    ////////////////////////////////////////////////////////////////////////////////
    // PRIVATE
    ////////////////////////////////////////////////////////////////////////////////

    // #[aztec(private)]
    // fn request_attestation(partition_table: [Field; MAX_SHIELD_IDS_LEN]) -> bool {
    //     let token_address = AztecAddress::new(context.msg_sender());
    //     let selector = compute_selector("_is_blacklisted((Field),Field)");
    //     // TODO: Use merkle tree intersection/non-intersection check
    //     let mut res = true;
    //     for i in 0..partition_table.len() {
    //         if context.call_public_function(context.this_address(), selector, [token_address, partition_table[i]) {
    //             res = false;
    //         }
    //     }
    //     res
    // }
    
    ////////////////////////////////////////////////////////////////////////////////
    // INTERNAL
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(public)]
    internal fn _initialize(
        new_admin: AztecAddress,
    ) {
        storage.admin.write(new_admin);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // UNCONSTRAINED
    ////////////////////////////////////////////////////////////////////////////////

    unconstrained fn admin() -> Field {
        storage.admin.read().address
    }

    unconstrained fn is_blacklisted(token: AztecAddress, shield_id: Field) -> bool {
        storage.blacklists.at(token.address).read().is_blacklisted(shield_id)
    }

    unconstrained fn compute_note_hash_and_nullifier(
        contract_address: Field,
        nonce: Field,
        storage_slot: Field,
        serialized_note: [Field; 0]
    ) -> [Field; 4] {
        [0; 4]
    }
}
