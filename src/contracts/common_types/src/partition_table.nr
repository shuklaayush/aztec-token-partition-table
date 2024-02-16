use dep::std::default::Default;

use crate::bounded_vec2::{BoundedVec2, N};

global PARTITION_TABLE_LEN: Field = 24;

// struct Shield {
//     shield_id: Field,
//     value: SafeU120,
// }

struct PartitionTable {
    // Stores the origin shield deposit IDs
    shield_ids: BoundedVec2,
    // Stores the attestations collected
    attestations: BoundedVec2, 
    // The older the block number, the less risky the shield is
    max_block_number: u64, 
    is_table_cleared: bool,
}

impl Default for PartitionTable {
    fn default() -> Self {
        Self {
            shield_ids: BoundedVec2::default(),
            attestations: BoundedVec2::default(),
            max_block_number: 0,
            is_table_cleared: false,
        }
    }
}

impl PartitionTable {
    pub fn new(shield_ids: BoundedVec2, attestations: BoundedVec2) -> Self {
        Self { shield_ids, attestations, max_block_number: 0, is_table_cleared: false }
    }

    pub fn join(self, other: PartitionTable) -> Self {
        Self {
            shield_ids: self.shield_ids.or(other.shield_ids),
            attestations: self.attestations.and(other.attestations),
            max_block_number: if self.max_block_number > other.max_block_number {
                self.max_block_number
            } else {
                other.max_block_number
            },
            is_table_cleared: self.is_table_cleared & other.is_table_cleared
        }
    }

    pub fn serialize(self) -> [Field; PARTITION_TABLE_LEN] {
        let mut res = [0; PARTITION_TABLE_LEN];
        let mut offset = 0;

        let shield_ids_serialized = self.shield_ids.serialize();
        for i in 0..N + 1 {
            res[i + offset] = shield_ids_serialized[i];
        }
        offset += N+1;

        let attestations_serialized = self.attestations.serialize();
        for i in 0..N + 1 {
            res[i + offset] = attestations_serialized[i];
        }
        offset += N+1;

        res[offset] = self.max_block_number as Field;
        offset += 1;

        res[offset] = self.is_table_cleared as Field;

        res
    }

    pub fn deserialize(serialized: [Field; PARTITION_TABLE_LEN]) -> Self {
        let mut res = PartitionTable::default();
        let mut offset = 0;

        let mut shield_ids_serialized = [0; N + 1];
        for i in 0..N + 1 {
            shield_ids_serialized[i] = serialized[i + offset];
        }
        res.shield_ids = BoundedVec2::deserialize(shield_ids_serialized);
        offset += N+1;

        let mut attestations_serialized = [0; N + 1];
        for i in 0..N + 1 {
            attestations_serialized[i] = serialized[i + offset];
        }
        res.attestations = BoundedVec2::deserialize(attestations_serialized);
        offset += N+1;

        res.max_block_number = serialized[offset] as u64;
        offset += 1;

        res.is_table_cleared = serialized[offset] as bool;

        res
    }
}

