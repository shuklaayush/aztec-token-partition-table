use dep::aztec::types::type_serialization::TypeSerializationInterface;

use crate::types::blacklist::{Blacklist, MAX_BLACKLIST_LEN};

global BLACKLIST_SERIALIZED_LEN: Field = 11;

fn deserializeBlacklist(serialized: [Field; BLACKLIST_SERIALIZED_LEN]) -> Blacklist {
    let mut res = Blacklist::empty();
    res.count = serialized[0];
    for i in 0..MAX_BLACKLIST_LEN {
        res.shield_ids[i] = serialized[i + 1];
    }
    res
}

fn serializeBlacklist(blacklist: Blacklist) -> [Field; BLACKLIST_SERIALIZED_LEN] {
    let mut res = [0; BLACKLIST_SERIALIZED_LEN];
    res[0] = blacklist.count;
    for i in 0..MAX_BLACKLIST_LEN {
        res[i + 1] = blacklist.shield_ids[i];
    }
    res
}

global BlacklistSerializationMethods = TypeSerializationInterface {
    deserialize: deserializeBlacklist,
    serialize: serializeBlacklist,
};

