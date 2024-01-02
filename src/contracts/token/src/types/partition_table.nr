use dep::aztec::types::address::AztecAddress;
use dep::safe_math::SafeU120;

global MAX_SHIELD_IDS_LEN: Field = 3;
global MAX_ATTESTATIONS_LEN: Field = 3;

// struct Shield {
//     shieldId: u32,
//     value: SafeU120,
// }

// TODO: No hardcode, change to vec if possible
struct PartitionTable {
    // TODO: Change to struct. Can I use vec?
    shield_ids: [u32; MAX_SHIELD_IDS_LEN], // Stores the origin shield deposit IDs
    attestations: [AztecAddress; MAX_ATTESTATIONS_LEN], // Stores the attestations collected
    block_number_min: Field,
    is_table_cleared: bool,
}

impl PartitionTable {
    pub fn new(shield_ids: [u32; MAX_SHIELD_IDS_LEN]) -> Self {
        ParitionTable {
            shield_ids: shield_ids,
            attestations: [AztecAddress::zero(); MAX_ATTESTATIONS_LEN],
            block_number_min: 0,
            is_table_cleared: false,
        }
    }

    pub fn empty() -> Self {
        ParitionTable {
            shields: [],
            attestations: [],
            block_number_min: 0,
            is_table_cleared: false,
        }
    }

    pub fn check_non_intersection(&self, other: &Self) -> bool {
        let mut res = true;
        for i in 0..MAX_SHIELDS_LEN {
            for j in 0..MAX_SHIELDS_LEN {
                if self.shields[i].shieldId == other.shields[j].shieldId {
                    res = false;
                }
            }
        }
        res
    }
}
