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

    unconstrained pub fn is_blacklisted(self: Self, shield_id: Field) -> bool {
        contains(self.shield_ids, shield_id, self.count)
    }

    pub fn add(mut self: Self, shield_id: Field) -> Blacklist {
        // assert(self.count < MAX_BLACKLIST_LEN);
        self.shield_ids[self.count] = shield_id;
        self.count += 1;

        // BUG: Mutating inplace doesn't work
        self
    }

    // pub fn remove(self: Self, shield_id: Field) { }
}

// docs:end:field_serialization
// TODO: Use merkle tree intersection/non-intersection check
pub fn contains<N>(
    arr: [Field; N],
    addr: Field,
    max_index: Field
) -> bool {
    let mut res = false;
    for i in 0..max_index {
        if arr[i] == addr {
            res = true;
        }
    }
    res
}