use dep::std::default::Default;
use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

struct BoundedVec2<MAX_LEN, SERIALIZED_LEN> {
    len: u64,
    elems: [Field; MAX_LEN],
}

impl<MAX_LEN, SERIALIZED_LEN> Default for BoundedVec2<MAX_LEN, SERIALIZED_LEN> {
    fn default() -> Self {
        Self {
            len: 0,
            elems: [0; MAX_LEN]
        }
    }
}

impl<MAX_LEN, SERIALIZED_LEN> BoundedVec2<MAX_LEN, SERIALIZED_LEN> {
    pub fn len(self) -> u64 {
        self.len
    }

    pub fn max_len(_self: BoundedVec2<MAX_LEN, SERIALIZED_LEN>) -> u64 {
        MAX_LEN
    }

    pub fn at(self, index: u64) -> Field {
        // assert(index < self.len, "index out of bounds");
        self.elems[index]
    }

    pub fn push(&mut self, item: Field) {
        // assert(self.len < MAX_LEN, "overflow");

        self.elems[self.len] = item;
        self.len += 1;
    }

    unconstrained fn get_index(self, item: Field) -> u64 {
        let mut index = 0;
        for i in 0..self.len {
            if (self.elems[i] == item) {
                index = i;
            }
        }
        index
    }

    pub fn contains(self, elem: Field) -> bool {
        let mut res = false;
        if self.len > 0 {
            let index = self.get_index(elem);
            assert(index < self.len);
            res = (self.elems[index] == elem);
        }
        res
    }

    pub fn or<MAX_LEN2, SERIALIZED_LEN2>(self, other: BoundedVec2<MAX_LEN2, SERIALIZED_LEN2>) -> Self {
        let mut res = BoundedVec2::default();
        for i in 0..MAX_LEN {
            if i < self.len {
                res.elems[res.len] = self.elems[i];
                res.len += 1;
            }
        }
        for i in 0..MAX_LEN {
            if (i < other.len) & !self.contains(other.elems[i]) {
                res.elems[res.len] = other.elems[i];
                res.len += 1;
            }
        }
        res
    }

    pub fn and<MAX_LEN2, SERIALIZED_LEN2>(self, other: BoundedVec2<MAX_LEN2, SERIALIZED_LEN2>) -> Self {
        let mut res = BoundedVec2::default();
        for i in 0..MAX_LEN {
            if (i < other.len) & self.contains(other.elems[i]) {
                res.elems[res.len] = other.elems[i];
                res.len += 1;
            }
        }
        res
    }
}

impl<MAX_LEN, SERIALIZED_LEN> Serialize<SERIALIZED_LEN> for BoundedVec2<MAX_LEN, SERIALIZED_LEN> {
    fn serialize(self: Self) -> [Field; SERIALIZED_LEN] {
        let mut res = [0; SERIALIZED_LEN];
        res[0] = self.len as Field;
        for i in 0..MAX_LEN {
            res[i + 1] = self.elems[i];
        }
        res
    }
}

impl<MAX_LEN, SERIALIZED_LEN> Deserialize<SERIALIZED_LEN> for BoundedVec2<MAX_LEN, SERIALIZED_LEN> {
    fn deserialize(serialized: [Field; SERIALIZED_LEN]) -> Self {
        let mut res = BoundedVec2::default();
        res.len = serialized[0] as u64;
        for i in 0..MAX_LEN {
            res.elems[i] = serialized[i + 1];
        }
        res
    }
}
