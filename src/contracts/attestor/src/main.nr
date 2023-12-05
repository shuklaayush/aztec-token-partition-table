// TODO: Attestor contract

contract Attestor {
    struct Storage {
    }


    impl Storage {
        fn init(context: Context) -> pub Self {
        }
    }

    // TODO: Maybe public?
    #[aztec(private)]
    pub fn add_to_blacklist(token_address: AztecAddress, deposit_id: u32) {

    }

    // TODO: Maybe public?
    #[aztec(private)]
    pub fn remove_from_blacklist(token_address: AztecAddress, deposit_id: u32) {

    }

    #[aztec(private)]
    fn request_attestation(table: PartitionTable, attestor: AztecAddress) -> bool {

    }
}
