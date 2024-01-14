use dep::std::hash;
use dep::aztec::oracle::debug_log;

fn compute_merkle_root<DEPTH>(leaf_index: Field, leaf_value: bool, siblings: [Field; DEPTH]) -> Field {
    // TODO: Assert leaf_index < 2^DEPTH
    let index_bits = leaf_index.to_le_bits(DEPTH as u32);
    let mut current = leaf_value as Field;
    for i in 0..DEPTH {
        let path_bit = index_bits[i] as bool;
        let (hash_left, hash_right) = if path_bit {
            (siblings[i], current)
        } else {
            (current, siblings[i])
        };
        current = hash::pedersen_hash([hash_left, hash_right]);
    }
    current
}

// Verifies non-membership
pub fn verify<DEPTH>(leaf_index: Field, root: Field, siblings: [Field; DEPTH]) -> bool {
    root == compute_merkle_root(leaf_index, false, siblings)
}

pub fn insert<DEPTH>(leaf_index: Field, old_root: Field, siblings: [Field; DEPTH]) -> Field {
    assert(
        old_root == compute_merkle_root(leaf_index, false, siblings), "old_root is incorrect or already exists"
    );
    compute_merkle_root(leaf_index, true, siblings)
}

pub fn remove<DEPTH>(leaf_index: Field, old_root: Field, siblings: [Field; DEPTH]) -> Field {
    assert(
        old_root == compute_merkle_root(leaf_index, true, siblings), "old_root is incorrect or doesn't exist"
    );
    compute_merkle_root(leaf_index, false, siblings)
}

#[test]
fn test_depth1_empty() {
    assert(
        compute_merkle_root(0, false, [0])
        == 0x27b1d0839a5b23baf12a8d195b18ac288fcf401afb2f70b8a4b529ede5fa9fed
    );
}

#[test]
fn test_depth1_left() {
    assert(
        compute_merkle_root(0, true, [0])
        == 0x2e8c6083fb43bef89fa5ee406f0bb9bd3d43780e02991ec42623d35d5657a808
    );
}

#[test]
fn test_depth1_right() {
    assert(
        compute_merkle_root(1, true, [0])
        == 0xd98561fb02ca04d00801dfdc118b2a24cea0351963587712a28d368041370e1
    );
}
