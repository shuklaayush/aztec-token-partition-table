use dep::aztec::types::address::AztecAddress;
use dep::safe_math::SafeU120;

use crate::types::vec::{Vec, N};

global PARTITION_TABLE_LEN: Field = 22;

// struct Shield {
//     shield_id: Field,
//     value: SafeU120,
// }

struct PartitionTable {
    // Stores the origin shield deposit IDs
    shield_ids: Vec,
    // Stores the attestations collected
    attestations: Vec, 
    // The older the block number, the less risky the shield is
    max_block_number: Field, 
    is_table_cleared: bool,
}

impl PartitionTable {
    pub fn new(shield_ids: Vec, attestations: Vec) -> Self {
        Self {
            shield_ids,
            attestations,
            max_block_number: 0,
            is_table_cleared: false,
        }
    }

    pub fn empty() -> Self {
        Self {
            shield_ids: Vec::empty(),
            attestations: Vec::empty(),
            max_block_number: 0,
            is_table_cleared: false,
        }
    }

    // TODO: Proper serialization that stores length
    pub fn serialize(self) -> [Field; PARTITION_TABLE_LEN] {
        let mut res = [0; PARTITION_TABLE_LEN];
        let mut offset = 0;
        for i in 0..N {
            res[i + offset] = self.shield_ids.elems[i];
        }
        offset += N;
        for i in 0..N {
            res[i + offset] = self.attestations.elems[i];
        }
        offset += N;
        res[offset] = self.max_block_number;
        offset += 1;
        res[offset] = self.is_table_cleared as Field;
        
        res
    }
}
