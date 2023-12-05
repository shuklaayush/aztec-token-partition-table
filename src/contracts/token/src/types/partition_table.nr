struct PartitionTable {
    shields: Vec<Shield>,
    attestations: Vec<Attestation>,
    block_number_min: Field,
    is_table_cleared: bool,
}

impl PartitionTable {
    pub fn new(contract_address: Field, nonce: Field, storage_slot: Field) -> Self {
        PartitionTable {
            contract_address,
            nonce,
            storage_slot,
            is_transient: false,
        }
    }

    pub fn empty() -> Self {
        NoteHeader {
            contract_address: 0,
            nonce: 0,
            storage_slot: 0,
            is_table_cleared: false,
        }
    }
}
