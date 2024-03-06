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

    use dep::aztec::prelude::{emit_unencrypted_log, NoteHeader, Map, PublicMutable, SharedImmutable, FunctionSelector, AztecAddress};

    use dep::common_types::{smt, partition_table::{PartitionTable, BOUNDED_VEC_LEN}};

    ////////////////////////////////////////////////////////////////////////////////
    // CONSTANTS
    ////////////////////////////////////////////////////////////////////////////////

    global DEPTH: u64 = 32;
    global EMPTY_ROOT: Field = 0x16642d9ccd8346c403aa4c3fa451178b22534a27035cdaa6ec34ae53b29c50cb;

    ////////////////////////////////////////////////////////////////////////////////
    // STORAGE
    ////////////////////////////////////////////////////////////////////////////////

    struct Storage {
        admin: PublicMutable<AztecAddress>,
        blacklists: Map<AztecAddress, PublicMutable<Field>>,
    }

    ////////////////////////////////////////////////////////////////////////////////
    // CONSTRUCTOR
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.write(admin);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // PUBLIC
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(public)]
    pub fn add_to_blacklist(token: AztecAddress, shield_id: Field, proof: [Field; DEPTH]) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");

        let mut old_root = storage.blacklists.at(token).read();
        if old_root == 0 {
            old_root = EMPTY_ROOT;
        }
        let new_root = smt::insert(shield_id, old_root, proof);

        storage.blacklists.at(token).write(new_root);

        emit_unencrypted_log(&mut context, token);
        emit_unencrypted_log(&mut context, shield_id);
    }

    #[aztec(public)]
    pub fn remove_from_blacklist(token: AztecAddress, shield_id: Field, proof: [Field; DEPTH]) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");

        let old_root = storage.blacklists.at(token).read();
        let new_root = smt::remove(shield_id, old_root, proof);

        storage.blacklists.at(token).write(new_root);

        emit_unencrypted_log(&mut context, token);
        emit_unencrypted_log(&mut context, shield_id);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // PRIVATE
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(private)]
    fn request_attestation(
        partition_table: PartitionTable,
        blacklist_root: Field,
        proofs: [Field; DEPTH * BOUNDED_VEC_LEN]
    ) -> bool {
        let token = context.msg_sender();

        // TODO: Use slow updates tree
        let selector = FunctionSelector::from_signature("_assert_blacklist_root((Field),Field)");
        context.call_public_function(
            context.this_address(),
            selector,
            [token.to_field(), blacklist_root]
        );

        let shield_ids = partition_table.shield_ids.elems;
        let mut res = true;
        let mut proof = [0; DEPTH];
        for i in 0..shield_ids.len() {
            for j in 0..DEPTH {
                proof[j] = proofs[i * DEPTH + j];
            }
            if !smt::verify(shield_ids[i], blacklist_root, proof) {
                res = false;
            }
        }
        res
    }

    ////////////////////////////////////////////////////////////////////////////////
    // INTERNAL
    ////////////////////////////////////////////////////////////////////////////////

    #[aztec(public)]
    #[aztec(internal)]
    fn _assert_blacklist_root(token: AztecAddress, rhs: Field) {
        let mut lhs = storage.blacklists.at(token).read();
        if lhs == 0 {
            lhs = EMPTY_ROOT;
        }
        assert(lhs == rhs, "incorrect blacklist root");
    }

    ////////////////////////////////////////////////////////////////////////////////
    // UNCONSTRAINED
    ////////////////////////////////////////////////////////////////////////////////

    unconstrained fn admin() -> pub Field {
        storage.admin.read().to_field()
    }

    unconstrained fn get_blacklist_root(token: AztecAddress) -> pub Field {
        let mut root = storage.blacklists.at(token).read();
        if root == 0 {
            root = EMPTY_ROOT;
        }
        root
    }

    unconstrained fn is_not_blacklisted(token: AztecAddress, shield_id: Field, proof: [Field; DEPTH]) -> pub bool {
        let mut root = storage.blacklists.at(token).read();
        if root == 0 {
            root = EMPTY_ROOT;
        }
        smt::verify(shield_id, root, proof)
    }
}
