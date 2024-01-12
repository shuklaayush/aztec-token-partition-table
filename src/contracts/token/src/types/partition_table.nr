use dep::protocol_types::address::AztecAddress;
use dep::safe_math::SafeU120;

use crate::types::bounded_vec::{BoundedVec, N};

global PARTITION_TABLE_LEN: Field = 24;

// struct Shield {
//     shield_id: Field,
//     value: SafeU120,
// }

struct PartitionTable {
    // Stores the origin shield deposit IDs
    shield_ids: BoundedVec,
    // Stores the attestations collected
    attestations: BoundedVec, 
    // The older the block number, the less risky the shield is
    max_block_number: Field, 
    is_table_cleared: bool,
}

impl PartitionTable {
    pub fn new(shield_ids: BoundedVec, attestations: BoundedVec) -> Self {
        Self {
            shield_ids,
            attestations,
            max_block_number: 0,
            is_table_cleared: false,
        }
    }

    pub fn empty() -> Self {
        Self {
            shield_ids: BoundedVec::empty(),
            attestations: BoundedVec::empty(),
            max_block_number: 0,
            is_table_cleared: false,
        }
    }

    pub fn serialize(self) -> [Field; PARTITION_TABLE_LEN] {
        let mut res = [0; PARTITION_TABLE_LEN];
        let mut offset = 0;

        let shield_ids_serialized = self.shield_ids.serialize();
        for i in 0..N+1 {
            res[i + offset] = shield_ids_serialized[i];
        }
        offset += N+1;

        let attestations_serialized = self.attestations.serialize();
        for i in 0..N+1 {
            res[i + offset] = attestations_serialized[i];
        }
        offset += N+1;

        res[offset] = self.max_block_number;
        offset += 1;

        res[offset] = self.is_table_cleared as Field;
        
        res
    }

    pub fn deserialize(serialized: [Field; PARTITION_TABLE_LEN]) -> Self {
        let mut res = PartitionTable::empty();
        let mut offset = 0;

        let mut shield_ids_serialized = [0; N+1];
        for i in 0..N+1 {
            shield_ids_serialized[i] = serialized[i + offset];
        }
        res.shield_ids = BoundedVec::deserialize(shield_ids_serialized);
        offset += N+1;

        let mut attestations_serialized = [0; N+1];
        for i in 0..N+1 {
            attestations_serialized[i] = serialized[i + offset];
        }
        res.attestations = BoundedVec::deserialize(attestations_serialized);
        offset += N+1;

        res.max_block_number = serialized[offset];
        offset += 1;

        res.is_table_cleared = serialized[offset] as bool;

        res
    }
}
