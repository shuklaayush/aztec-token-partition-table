global N: Field = 10;

struct Vec {
    len: Field,
    elems: [Field; N],
}

impl Vec {
    pub fn empty() -> Self {
        Self {
            len: 0,
            elems: [0; N]
        }
    }

    pub fn push(mut self, item: Field) -> Self {
        // assert(self.len < N, "overflow");

        self.elems[self.len] = item;
        self.len += 1;

        // BUG: Mutating inplace doesn't work
        self
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

    pub fn serialize(self) -> [Field; N+1] {
        let mut res = [0; N+1];
        res[0] = self.len;
        for i in 0..N {
            res[i + 1] = self.elems[i];
        }
        res
    }

    pub fn deserialize(serialized: [Field; N+1]) -> Self {
        let mut res = Vec::empty();
        res.len = serialized[0];
        for i in 0..N {
            res.elems[i] = serialized[i + 1];
        }
        res
    }
}

