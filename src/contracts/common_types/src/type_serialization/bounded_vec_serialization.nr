use dep::aztec::types::type_serialization::TypeSerializationInterface;

use crate::bounded_vec::{BoundedVec, N};

fn deserializeBoundedVec(serialized: [Field; N+1]) -> BoundedVec {
    BoundedVec::deserialize(serialized)
}

fn serializeBoundedVec(blacklist: BoundedVec) -> [Field; N+1] {
    blacklist.serialize()
}

global BoundedVecSerializationMethods = TypeSerializationInterface {
    deserialize: deserializeBoundedVec,
    serialize: serializeBoundedVec,
};

