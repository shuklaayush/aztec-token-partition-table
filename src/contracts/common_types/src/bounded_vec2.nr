use dep::std::default::Default;

global N: u64 = 10;

struct BoundedVec2 {
    len: u64,
    elems: [Field; N],
}

impl Default for BoundedVec2 {
    fn default() -> Self {
        Self {
            len: 0,
            elems: [0; N]
        }
    }
}

impl BoundedVec2 {
    pub fn len(self) -> u64 {
        self.len
    }

    pub fn at(self, index: u64) -> Field {
        // assert(index < self.len, "index out of bounds");
        self.elems[index]
    }

    pub fn push(&mut self, item: Field) {
        // assert(self.len < N, "overflow");

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

    pub fn or(self, other: BoundedVec2) -> Self {
        let mut res = BoundedVec2::default();
        for i in 0..N {
            if i < self.len {
                res.elems[res.len] = self.elems[i];
                res.len += 1;
            }
        }
        for i in 0..N {
            if (i < other.len) & !self.contains(other.elems[i]) {
                res.elems[res.len] = other.elems[i];
                res.len += 1;
            }
        }
        res
    }

    pub fn and(self, other: BoundedVec2) -> Self {
        let mut res = BoundedVec2::default();
        for i in 0..N {
            if (i < other.len) & self.contains(other.elems[i]) {
                res.elems[res.len] = other.elems[i];
                res.len += 1;
            }
        }
        res
    }

    pub fn serialize(self) -> [Field; N+1] {
        let mut res = [0; N + 1];
        res[0] = self.len as Field;
        for i in 0..N {
            res[i + 1] = self.elems[i];
        }
        res
    }

    pub fn deserialize(serialized: [Field; N+1]) -> Self {
        let mut res = BoundedVec2::default();
        res.len = serialized[0] as u64;
        for i in 0..N {
            res.elems[i] = serialized[i + 1];
        }
        res
    }
}
