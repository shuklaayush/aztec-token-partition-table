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

contract Attestor {
    ////////////////////////////////////////////////////////////////////////////////
    // IMPORTS
    ////////////////////////////////////////////////////////////////////////////////

    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        note::{
            note_header::NoteHeader,
            utils as note_utils
        },
        selector::compute_selector,
        state_vars::{map::Map, singleton::Singleton ,public_state::PublicState},
        types::type_serialization::{
            aztec_address_serialization::{AztecAddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN},
        },
        types::address::AztecAddress,
    };

    use crate::types::blacklist_note::{BlacklistNote, BlacklistNoteMethods, BLACKLIST_NOTE_LEN};
    use crate::utils::{MAX_SHIELD_IDS_LEN, contains};

    ////////////////////////////////////////////////////////////////////////////////
    // STORAGE
    ////////////////////////////////////////////////////////////////////////////////

    struct Storage {
        admin: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,
        // TODO: blacklist_of?
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
    pub fn add_to_blacklist(token_address: AztecAddress, shield_id: u32) {
        assert(storage.admin.read().eq(AztecAddress::new(context.msg_sender())), "caller is not admin");

        let mut blacklist_note = storage.blacklisted.at(token_address.address).get_note(false);
        blacklist_note.shield_ids[blacklist_note.count] = shield_id;
        blacklist_note.count += 1;

        storage.blacklisted.at(token_address.address).replace(&mut blacklist_note, true);
    }

    // TODO
    // #[aztec(public)]
    // pub fn remove_from_blacklist(token_address: AztecAddress, shield_id: u32) {
    //     storage.blacklisted.at(shield_id as Field).write(false);
    // }

    #[aztec(public)]
    pub fn is_blacklisted(token_address: AztecAddress, shield_id: u32) {
        let selector = compute_selector("_is_blacklisted((Field),u32)");
        let return_values = context.call_public_function(context.this_address(), selector, [token_address.address, shield_id as Field]);
        return_values[0] as bool
    }

    ////////////////////////////////////////////////////////////////////////////////
    // PRIVATE
    ////////////////////////////////////////////////////////////////////////////////

    // #[aztec(private)]
    // fn request_attestation(partition_table: [u32; MAX_SHIELD_IDS_LEN]) -> bool {
    //     let token_address = AztecAddress::new(context.msg_sender());
    //     let selector = compute_selector("_is_blacklisted((Field),u32)");
    //     // TODO: Use merkle tree intersection/non-intersection check
    //     let mut res = true;
    //     for i in 0..partition_table.len() {
    //         if context.call_public_function(context.this_address(), selector, [token_address, partition_table[i] as Field]) {
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

    #[aztec(public)]
    internal fn _is_blacklisted(token_address: AztecAddress, shield_id: u32) -> bool {
        let mut res = false;
        let blacklist_note = storage.blacklisted.at(token_address.address).get_note(false);
        if contains(blacklist_note.shield_ids, shield_id) {
            res = true;
        }
        res
    }

    ////////////////////////////////////////////////////////////////////////////////
    // UNCONSTRAINED
    ////////////////////////////////////////////////////////////////////////////////

    unconstrained fn admin() -> Field {
        storage.admin.read().address
    }

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
