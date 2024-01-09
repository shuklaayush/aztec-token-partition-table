global MAX_BLACKLIST_LEN: Field = 10;

struct Blacklist {
    count: Field,
    shield_ids: [Field; MAX_BLACKLIST_LEN],
}

impl Blacklist {
    pub fn new(count: Field, shield_ids: [Field; MAX_BLACKLIST_LEN]) -> Blacklist {
        Blacklist {
            count,
            shield_ids,
        }
    }

    pub fn empty() -> Blacklist {
        Blacklist {
            count: 0,
            shield_ids: [0; MAX_BLACKLIST_LEN]
        }
    }

    pub fn add(mut self: Self, shield_id: Field) -> Blacklist {
        // assert(self.count < MAX_BLACKLIST_LEN);
        self.shield_ids[self.count] = shield_id;
        self.count += 1;

        // BUG: Mutating inplace doesn't work
        self
    }

    // pub fn remove(self: Self, shield_id: Field) { }

    pub fn contains(self: Self, shield_id: Field) -> bool {
        contains(self.shield_ids, shield_id)
    }
}

// docs:end:field_serialization
// TODO: Use merkle tree intersection/non-intersection check
pub fn contains<N>(
    arr: [Field; N],
    elem: Field,
) -> bool {
    let mut res = false;
    for i in 0..N {
        // TODO: Use u32 at places if required
        if (elem as u32 > 0 as u32) & (arr[i] == elem) {
            res = true;
        }
    }
    res
}