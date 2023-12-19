// TODO: Attestor contract
//       The Attestor contract tracks blacklisted deposit IDs. 
//       Attestations are dispensed if a note’s partition table does not intersect with the blacklist.
//
//       The blacklist must be accessible from private functions. A possible solution is to store the blacklist as an indexed merkle tree. 
//       Race conditions that arise from updating the tree can be deferred and considered out-of-scope for the MPV.
//
//       The request_attestation method requires a set-non-intersection check that is of independent interest and should be implemented as a 3rd party library.

contract Attestor {
    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        state_vars::{map::Map, public_state::PublicState},
        types::type_serialization::{
            bool_serialization::{BoolSerializationMethods, BOOL_SERIALIZED_LEN},
        },
        types::address::{AztecAddress},
    };

    struct Storage {
        // TODO: Change this to an indexed merkle tree
        blacklisted: Map<PublicState<bool, BOOL_SERIALIZED_LEN>>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                blacklisted: Map::new(
                    context,
                    0,
                    |context, slot| {
                        PublicState::new(
                            context,
                            slot,
                            BoolSerializationMethods,
                        )
                    },
                ),
            }
        }
    }

    #[aztec(public)]
    pub fn add_to_blacklist(token_address: AztecAddress, deposit_id: u32) {
        // TODO: Add admin
        // assert(storage.admin.read().eq(AztecAddress::new(context.msg_sender())), "caller is not admin");
        storage.blacklisted.at(deposit_id).write(true);
    }

    #[aztec(public)]
    pub fn remove_from_blacklist(token_address: AztecAddress, deposit_id: u32) {
        storage.blacklisted.at(deposit_id).write(false);
    }

    #[aztec(private)]
    fn request_attestation(table: PartitionTable, attestor: AztecAddress) -> bool {
        // TODO: Do a non-intersection check between the partition table and the blacklist
    }
}
