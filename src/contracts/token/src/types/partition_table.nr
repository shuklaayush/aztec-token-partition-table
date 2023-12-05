use dep::aztec::types::AztecAddress;
use dep::safe_math::SafeU120;

global MAX_SHIELDS_LEN: Field = 3;
global MAX_ATTESTATIONS_LEN: Field = 3;

struct Shield {
    shieldId: u32,
    value: SafeU120,
}

struct PartitionTable {
    shields: Vec<Shield>, // Stores the shield deposit IDs
    attestations: Vec<AztecAddress>, // Stores the attestations collected
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
        ParitionTable {
            contract_address: 0,
            nonce: 0,
            storage_slot: 0,
            is_table_cleared: false,
        }
    }
}
