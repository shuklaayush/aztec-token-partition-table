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
    ////////////////////////////////////////////////////////////////////////////////
    // IMPORTS
    ////////////////////////////////////////////////////////////////////////////////

    use dep::aztec::{
        context::Context,
        note::{
            note_header::NoteHeader,
            utils as note_utils
        },
        state_vars::{map::Map, public_state::PublicState},
        types::type_serialization::{
            address_serialization::{AddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN},
            field_serialization::{FieldSerializationMethods, FIELD_SERIALIZED_LEN},
        },
    };
    use dep::protocol_types::{
        abis::function_selector::FunctionSelector,
        address::AztecAddress,
    };

    use crate::types::{blacklist::Blacklist, type_serialization::blacklist_serialization::{BLACKLIST_SERIALIZED_LEN, BlacklistSerializationMethods}};

    ////////////////////////////////////////////////////////////////////////////////
    // CONSTANTS
    ////////////////////////////////////////////////////////////////////////////////

    global MAX_SHIELD_IDS_LEN: Field = 10;

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
                    AddressSerializationMethods,
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
        let selector = FunctionSelector::from_signature("_initialize((Field))");
        context.call_public_function(context.this_address(), selector, [admin.to_field()]);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // PUBLIC
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(public)]
    pub fn add_to_blacklist(token: AztecAddress, shield_id: Field) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        // assert(shield_id > 0, "shield id must be non-zero");

        let mut blacklist = storage.blacklists.at(token.to_field()).read();
        let blacklist = blacklist.add(shield_id);
        storage.blacklists.at(token.to_field()).write(blacklist);
    }

    #[aztec(public)]
    pub fn remove_from_blacklist(token: AztecAddress, shield_id: Field) {
        // TODO
    }

    #[aztec(public)]
    fn request_attestation(partition_table: [Field; MAX_SHIELD_IDS_LEN]) -> bool {
        let token = context.msg_sender();

        let mut res = true;
        for i in 0..partition_table.len() {
            if storage.blacklists.at(token.to_field()).read().contains(partition_table[i]) {
                res = false;
            }
        }
        res
    }

    #[aztec(public)]
    fn assert_attestation(partition_table: [Field; MAX_SHIELD_IDS_LEN]) {
        let token = context.msg_sender();

        for i in 0..partition_table.len() {
            if storage.blacklists.at(token.to_field()).read().contains(partition_table[i]) {
                assert(false, "intersects");
            }
        }
    }

    ////////////////////////////////////////////////////////////////////////////////
    // PRIVATE
    ////////////////////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////////
    // INTERNAL
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(public)]
    internal fn _initialize(new_admin: AztecAddress) {
        storage.admin.write(new_admin);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // UNCONSTRAINED
    ////////////////////////////////////////////////////////////////////////////////

    unconstrained fn admin() -> pub Field {
        storage.admin.read().to_field()
    }

    unconstrained fn is_blacklisted(token: AztecAddress, shield_id: Field) -> pub bool {
        storage.blacklists.at(token.to_field()).read().contains(shield_id)
    }

    unconstrained fn compute_note_hash_and_nullifier(
        contract_address: AztecAddress,
        nonce: Field,
        storage_slot: Field,
        serialized_note: [Field; 0]
    ) -> pub [Field; 4] {
        [0; 4]
    }
}
