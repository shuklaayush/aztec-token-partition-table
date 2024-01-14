// TODO: Attestor contract
//       The Attestor contract tracks blacklisted deposit IDs. 
//       Attestations are dispensed if a note’s partition table does not intersect with the blacklist.
//
//       The blacklist must be accessible from private functions. A possible solution is to store the blacklist as an indexed merkle tree. 
//       Race conditions that arise from updating the tree can be deferred and considered out-of-scope for the MPV.
//
//       The request_attestation method requires a set-non-intersection check that is of independent interest and should be implemented as a 3rd party library.

contract Attestor {
    ////////////////////////////////////////////////////////////////////////////////
    // IMPORTS
    ////////////////////////////////////////////////////////////////////////////////

    use dep::aztec::{
        log::emit_unencrypted_log,
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
    use dep::common_types::{smt, partition_table::PartitionTable, bounded_vec::{BoundedVec, N}, type_serialization::bounded_vec_serialization::BoundedVecSerializationMethods};

    ////////////////////////////////////////////////////////////////////////////////
    // CONSTANTS
    ////////////////////////////////////////////////////////////////////////////////

    global DEPTH: Field = 254;
    global EMPTY_ROOT: Field = 0xccaafdc9c353743970d4e305ae73641ce694f07db67886d2769c9ed88e969d8;

    ////////////////////////////////////////////////////////////////////////////////
    // STORAGE
    ////////////////////////////////////////////////////////////////////////////////

    struct Storage {
        admin: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,
        blacklists: Map<PublicState<Field, FIELD_SERIALIZED_LEN>>,
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
                            FieldSerializationMethods,
                        )
                    },
                ),
            }
        }
    }

    ////////////////////////////////////////////////////////////////////////////////
    // CONSTRUCTOR
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(private)]
    fn constructor(admin: AztecAddress) {
        let selector = FunctionSelector::from_signature("_initialize((Field))");
        context.call_public_function(context.this_address(), selector, [admin.to_field()]);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // PUBLIC
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(public)]
    pub fn add_to_blacklist(token: AztecAddress, shield_id: Field, proof: [Field; DEPTH]) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");

        let mut old_root = storage.blacklists.at(token.to_field()).read();
        if old_root == 0 {
            old_root = EMPTY_ROOT;
        }
        let new_root = smt::insert(shield_id, old_root, proof);

        storage.blacklists.at(token.to_field()).write(new_root);

        emit_unencrypted_log(&mut context, token.to_field());
        emit_unencrypted_log(&mut context, shield_id);
    }

    #[aztec(public)]
    pub fn remove_from_blacklist(token: AztecAddress, shield_id: Field, proof: [Field; DEPTH]) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");

        let old_root = storage.blacklists.at(token.to_field()).read();
        let new_root = smt::remove(shield_id, old_root, proof);

        storage.blacklists.at(token.to_field()).write(new_root);

        emit_unencrypted_log(&mut context, token.to_field());
        emit_unencrypted_log(&mut context, shield_id);
    }

    #[aztec(public)]
    fn request_attestation(partition_table: PartitionTable, proof: [Field; DEPTH]) -> bool {
        let token = context.msg_sender();

        let shield_ids = partition_table.shield_ids.elems;
        let mut res = true;
        for i in 0..shield_ids.len() {
            let root = storage.blacklists.at(token.to_field()).read();
            if smt::verify(shield_ids[i], root, proof) {
                res = false;
            }
        }
        res
    }

    #[aztec(public)]
    fn assert_attestation(partition_table: PartitionTable, proof: [Field; DEPTH]) {
        let token = context.msg_sender();

        let shield_ids = partition_table.shield_ids.elems;
        for i in 0..shield_ids.len() {
            let root = storage.blacklists.at(token.to_field()).read();
            if smt::verify(shield_ids[i], root, proof) {
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

    unconstrained fn get_blacklist_root(token: AztecAddress) -> pub Field {
        let mut root = storage.blacklists.at(token.to_field()).read();
        if root == 0 {
            root = EMPTY_ROOT;
        }
        root
    }

    unconstrained fn is_not_blacklisted(token: AztecAddress, shield_id: Field, proof: [Field; DEPTH]) -> pub bool {
        let mut root = storage.blacklists.at(token.to_field()).read();
        if root == 0 {
            root = EMPTY_ROOT;
        }
        smt::verify(shield_id, root, proof)
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
