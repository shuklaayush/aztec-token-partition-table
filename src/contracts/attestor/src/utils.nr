
global MAX_SHIELD_IDS_LEN: Field = 10;

// TODO: Use merkle tree intersection/non-intersection check
pub fn contains<N>(
    arr: [u32; N],
    addr: u32
) -> bool {
    let mut res = false;
    for i in 0..arr.len() {
        if arr[i] == addr {
            res = true;
        }
    }
    res
}