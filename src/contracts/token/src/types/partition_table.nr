use dep::aztec::types::address::AztecAddress;
use dep::safe_math::SafeU120;

// TODO: Better names
global MAX_SHIELD_IDS_LEN: Field = 10;
global MAX_ATTESTATIONS_LEN: Field = 10;

// TODO: No hardcode
global PARTITION_TABLE_LEN: Field = 22;

// struct Shield {
//     shield_id: u32,
//     value: SafeU120,
// }

// TODO: No hardcode, change to vec if possible
struct PartitionTable {
    // TODO: Change to struct. Can I use vec?
    shield_ids: [u32; MAX_SHIELD_IDS_LEN], // Stores the origin shield deposit IDs
    attestations: [AztecAddress; MAX_ATTESTATIONS_LEN], // Stores the attestations collected
    max_block_number: Field, // The older the block number, the less risky the shield is
    is_table_cleared: bool,
}

impl PartitionTable {
    pub fn new(shield_ids: [u32; MAX_SHIELD_IDS_LEN]) -> Self {
        Self {
            shield_ids: shield_ids,
            attestations: [AztecAddress::new(0); MAX_ATTESTATIONS_LEN],
            max_block_number: 0,
            is_table_cleared: false,
        }
    }

    pub fn empty() -> Self {
        Self {
            shield_ids: [0; MAX_SHIELD_IDS_LEN],
            attestations: [AztecAddress::new(0); MAX_ATTESTATIONS_LEN],
            max_block_number: 0,
            is_table_cleared: false,
        }
    }

    pub fn check_non_intersection(self, other: Self) -> bool {
        let mut res = true;
        for i in 0..MAX_SHIELD_IDS_LEN {
            for j in 0..MAX_SHIELD_IDS_LEN {
                if self.shield_ids[i] == other.shield_ids[j] {
                    res = false;
                }
            }
        }
        res
    }
    
    pub fn serialize(self) -> [Field; PARTITION_TABLE_LEN] {
        let mut res = [0 as Field; PARTITION_TABLE_LEN];
        let mut offset = 0;
        for i in 0..MAX_SHIELD_IDS_LEN {
            res[i + offset] = self.shield_ids[i] as Field;
        }
        offset += MAX_SHIELD_IDS_LEN;
        for i in 0..MAX_ATTESTATIONS_LEN {
            res[i + offset] = self.attestations[i + offset].address;
        }
        offset += MAX_ATTESTATIONS_LEN;
        res[offset] = self.max_block_number;
        offset += 1;
        res[offset] = self.is_table_cleared as Field;
        
        res
    }
}
