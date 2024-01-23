use dep::std::default::Default;

global N: u64 = 10;

struct BoundedVec {
    len: u64,
    elems: [Field; N],
}

impl Default for BoundedVec {
    fn default() -> Self {
        Self {
            len: 0,
            elems: [0; N]
        }
    }
}

impl BoundedVec {
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

    pub fn contains(self, elem: Field) -> bool {
        let mut res = false;
        for i in 0..N {
            // TODO: Use u32 at places if required
            if (i as u32 < self.len as u32) & (self.elems[i] == elem) {
                res = true;
            }
        }
        res
    }
    
    pub fn or(self, other: BoundedVec) -> Self {
        let mut res = BoundedVec::default();
        res.len = self.len + other.len;
        for i in 0..N {
            if i as u64 < self.len {
                res.elems[i] = self.elems[i];
            } else if i < self.len + other.len {
                res.elems[i] = other.elems[i - self.len];
            }
        }
        res
    }

    pub fn and(self, other: BoundedVec) -> Self {
        let mut res = BoundedVec::default();
        res.len = 0;
        for i in 0..N {
            if self.contains(other.elems[i]) {
                res.push(other.elems[i]);
            }
        }
        res
    }

    pub fn serialize(self) -> [Field; N+1] {
        let mut res = [0; N+1];
        res[0] = self.len as Field;
        for i in 0..N {
            res[i + 1] = self.elems[i];
        }
        res
    }

    pub fn deserialize(serialized: [Field; N+1]) -> Self {
        let mut res = BoundedVec::default();
        res.len = serialized[0] as u64;
        for i in 0..N {
            res.elems[i] = serialized[i + 1];
        }
        res
    }
}

