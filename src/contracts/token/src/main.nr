// docs:start:token_all
// docs:start:imports
mod interfaces;
mod types;

// Minimal token implementation that supports `AuthWit` accounts.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.

contract Token {
    // Libs

    // use dep::compressed_string::FieldCompressedString;

    use dep::aztec::prelude::{
        NoteGetterOptions, NoteHeader, Map, PublicMutable, SharedImmutable, PrivateSet,
        FunctionSelector, AztecAddress
    };
    // TODO: Emit log from public function and call
    use dep::aztec::log::emit_unencrypted_log_from_private;
    use dep::aztec::hash::compute_secret_hash;

    // docs:start:import_authwit
    use dep::authwit::{auth::{assert_current_call_valid_authwit, assert_current_call_valid_authwit_public}};
    // docs:end:import_authwit

    use dep::common_types::{partition_table::{PartitionTable, BOUNDED_VEC_LEN}};

    use crate::interfaces::Attestor::AttestorPrivateContextInterface as Attestor;
    use crate::types::{transparent_note::TransparentNote, token_note::{TokenNote, TOKEN_NOTE_LEN}, balances_map::BalancesMap};
    // docs:end::imports

    // TODO: Move to a common crate
    global DEPTH: u64 = 32;

    // docs:start:storage_struct
    struct Storage {
        // docs:start:storage_admin
        admin: PublicMutable<AztecAddress>,
        // docs:end:storage_admin
        // docs:start:storage_minters
        minters: Map<AztecAddress, PublicMutable<bool>>,
        // docs:end:storage_minters
        // docs:start:storage_balances
        balances: BalancesMap<TokenNote>,
        // docs:end:storage_balances
        total_supply: PublicMutable<U128>,
        // docs:start:storage_pending_shields
        pending_shields: PrivateSet<TransparentNote>,
        // docs:end:storage_pending_shields
        public_balances: Map<AztecAddress, PublicMutable<U128>>,
        // symbol: SharedImmutable<FieldCompressedString>,
        // name: SharedImmutable<FieldCompressedString>,
        // docs:start:storage_decimals
        // decimals: SharedImmutable<u8>,
        // docs:end:storage_decimals
        // total number of shielded notes
        // numShields from spec
        note_counter: PublicMutable<u32>,
    }
    // docs:end:storage_struct

    // docs:start:constructor
    #[aztec(public)]
    #[aztec(initializer)]
    // fn constructor(admin: AztecAddress, name: str<31>, symbol: str<31>, decimals: u8) {
    fn constructor(admin: AztecAddress) {
        assert(!admin.is_zero(), "invalid admin");
        storage.admin.write(admin);
        storage.minters.at(admin).write(true);
        // storage.name.initialize(FieldCompressedString::from_string(name));
        // storage.symbol.initialize(FieldCompressedString::from_string(symbol));
        // docs:start:initialize_decimals
        // storage.decimals.initialize(decimals);
        // docs:end:initialize_decimals
    }
    // docs:end:constructor

    // docs:start:set_admin
    #[aztec(public)]
    fn set_admin(new_admin: AztecAddress) {
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        // docs:start:write_admin
        storage.admin.write(new_admin);
        // docs:end:write_admin
    }
    // docs:end:set_admin

    // #[aztec(public)]
    // fn public_get_name() -> pub FieldCompressedString {
    //     storage.name.read_public()
    // }

    // #[aztec(private)]
    // fn private_get_name() -> pub FieldCompressedString {
    //     storage.name.read_private()
    // }

    // unconstrained fn un_get_name() -> pub [u8; 31] {
    //     storage.name.read_public().to_bytes()
    // }

    // #[aztec(public)]
    // fn public_get_symbol() -> pub FieldCompressedString {
    //     storage.symbol.read_public()
    // }

    // #[aztec(private)]
    // fn private_get_symbol() -> pub FieldCompressedString {
    //     storage.symbol.read_private()
    // }

    // unconstrained fn un_get_symbol() -> pub [u8; 31] {
    //     storage.symbol.read_public().to_bytes()
    // }

    // #[aztec(public)]
    // fn public_get_decimals() -> pub u8 {
    //     // docs:start:read_decimals_public
    //     storage.decimals.read_public()
    //     // docs:end:read_decimals_public
    // }

    // #[aztec(private)]
    // fn private_get_decimals() -> pub u8 {
    //     // docs:start:read_decimals_private
    //     storage.decimals.read_private()
    //     // docs:end:read_decimals_private
    // }

    // unconstrained fn un_get_decimals() -> pub u8 {
    //     storage.decimals.read_public()
    // }

    // docs:start:set_minter
    #[aztec(public)]
    fn set_minter(minter: AztecAddress, approve: bool) {
        // docs:start:read_admin
        assert(storage.admin.read().eq(context.msg_sender()), "caller is not admin");
        // docs:end:read_admin
        // docs:start:write_minter
        storage.minters.at(minter).write(approve);
        // docs:end:write_minter
    }
    // docs:end:set_minter

    // docs:start:mint_public
    #[aztec(public)]
    fn mint_public(to: AztecAddress, amount: Field) {
        // docs:start:read_minter
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
        // docs:end:read_minter
        let amount = U128::from_integer(amount);
        let new_balance = storage.public_balances.at(to).read().add(amount);
        let supply = storage.total_supply.read().add(amount);

        storage.public_balances.at(to).write(new_balance);
        storage.total_supply.write(supply);
    }
    // docs:end:mint_public

    // docs:start:mint_private
    #[aztec(public)]
    fn mint_private(amount: Field, secret_hash: Field) {
        assert(storage.minters.at(context.msg_sender()).read(), "caller is not minter");
        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount, secret_hash);
        let supply = storage.total_supply.read().add(U128::from_integer(amount));

        storage.total_supply.write(supply);
        // docs:start:insert_from_public
        pending_shields.insert_from_public(&mut note);
        // docs:end:insert_from_public
    }
    // docs:end:mint_private

    #[aztec(private)]
    fn privately_mint_private_note(amount: Field, note_counter: u32) {
        let pt = PartitionTable::with_single_shield_id(note_counter as Field);
        storage.balances.add(context.msg_sender(), U128::from_integer(amount), pt);

        let selector = FunctionSelector::from_signature("assert_minter_and_mint((Field),Field)");
        let _void = context.call_public_function(
            context.this_address(),
            selector,
            [context.msg_sender().to_field(), amount]
        );

        let selector = FunctionSelector::from_signature("_assert_note_counter_and_increment(Field)");
        let _void = context.call_public_function(context.this_address(), selector, [note_counter as Field]);
    }

    #[aztec(public)]
    #[aztec(internal)]
    fn assert_minter_and_mint(minter: AztecAddress, amount: Field) {
        assert(storage.minters.at(minter).read(), "caller is not minter");
        let supply = storage.total_supply.read() + U128::from_integer(amount);
        storage.total_supply.write(supply);
    }

    // docs:start:shield
    #[aztec(public)]
    fn shield(from: AztecAddress, amount: Field, secret_hash: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            // The redeem is only spendable once, so we need to ensure that you cannot insert multiple shields from the same message.
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);

        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount.to_integer(), secret_hash);

        storage.public_balances.at(from).write(from_balance);
        pending_shields.insert_from_public(&mut note);
    }
    // docs:end:shield

    // docs:start:transfer_public
    #[aztec(public)]
    fn transfer_public(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let to_balance = storage.public_balances.at(to).read().add(amount);
        storage.public_balances.at(to).write(to_balance);
    }
    // docs:end:transfer_public

    // docs:start:burn_public
    #[aztec(public)]
    fn burn_public(from: AztecAddress, amount: Field, nonce: Field) {
        // docs:start:assert_current_call_valid_authwit_public
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        // docs:end:assert_current_call_valid_authwit_public

        let amount = U128::from_integer(amount);
        let from_balance = storage.public_balances.at(from).read().sub(amount);
        storage.public_balances.at(from).write(from_balance);

        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);
    }
    // docs:end:burn_public

    // docs:start:redeem_shield
    // TODO: note_counter should be a u32 but call from test fails with invalid sig
    #[aztec(private)]
    fn redeem_shield(to: AztecAddress, amount: Field, note_counter: Field, secret: Field) {
        let pending_shields = storage.pending_shields;
        let secret_hash = compute_secret_hash(secret);
        // Get 1 note (set_limit(1)) which has amount stored in field with index 0 (select(0, amount)) and secret_hash
        // stored in field with index 1 (select(1, secret_hash)).
        let options = NoteGetterOptions::new().select(0, amount, Option::none()).select(1, secret_hash, Option::none()).set_limit(1);
        let notes = pending_shields.get_notes(options);
        let note = notes[0].unwrap_unchecked();
        // Remove the note from the pending shields set
        pending_shields.remove(note);

        let pt = PartitionTable::with_single_shield_id(note_counter);
        // Add the token note to user's balances set
        storage.balances.add(to, U128::from_integer(amount), pt);

        let selector = FunctionSelector::from_signature("_assert_note_counter_and_increment(Field)");
        let _void = context.call_public_function(context.this_address(), selector, [note_counter]);
    }
    // docs:end:redeem_shield

    // docs:start:unshield
    #[aztec(private)]
    fn unshield(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let pt = storage.balances.sub(from, U128::from_integer(amount));

        for i in 0..pt.attestations.max_len() {
            if i < pt.attestations.len() {
                emit_unencrypted_log_from_private(&mut context, pt.attestations.at(i));
            }
        }

        let selector = FunctionSelector::from_signature("_increase_public_balance((Field),Field)");
        let _void = context.call_public_function(context.this_address(), selector, [to.to_field(), amount]);
    }
    // docs:end:unshield

    // docs:start:transfer
    #[aztec(private)]
    fn transfer(from: AztecAddress, to: AztecAddress, amount: Field, nonce: Field) {
        // docs:start:assert_current_call_valid_authwit
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }
        // docs:end:assert_current_call_valid_authwit

        let amount = U128::from_integer(amount);
        let pt = storage.balances.sub(from, amount);
        // docs:start:increase_private_balance
        storage.balances.add(to, amount, pt);
        // docs:end:increase_private_balance
    }
    // docs:end:transfer

    // docs:start:burn
    #[aztec(private)]
    fn burn(from: AztecAddress, amount: Field, nonce: Field) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.sub(from, U128::from_integer(amount));

        let selector = FunctionSelector::from_signature("_reduce_total_supply(Field)");
        let _void = context.call_public_function(context.this_address(), selector, [amount]);
    }
    // docs:end:burn

    // TODO: Recursively call `request_attestation` until all attestations are received?
    #[aztec(private)]
    fn request_attestation(
        from: AztecAddress,
        attestor: AztecAddress,
        blacklist_root: Field,
        proofs: [Field; DEPTH * BOUNDED_VEC_LEN],
        nonce: Field
    ) {
        if (!from.eq(context.msg_sender())) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let maybe_note = storage.balances.last_unattested_note(from, attestor);
        if maybe_note.is_some() {
            let note = maybe_note.unwrap_unchecked();

            let attested = Attestor::at(attestor).request_attestation(&mut context, note.partition_table, blacklist_root, proofs)[0] as bool;
            if attested {
                storage.balances.add_attestation(from, note, attestor);
            }
        }
    }

    /// Internal ///

    // docs:start:increase_public_balance
    #[aztec(public)]
    #[aztec(internal)]
    fn _increase_public_balance(to: AztecAddress, amount: Field) {
        let new_balance = storage.public_balances.at(to).read().add(U128::from_integer(amount));
        storage.public_balances.at(to).write(new_balance);
    }
    // docs:end:increase_public_balance

    // docs:start:reduce_total_supply
    #[aztec(public)]
    #[aztec(internal)]
    fn _reduce_total_supply(amount: Field) {
        // Only to be called from burn.
        let new_supply = storage.total_supply.read().sub(U128::from_integer(amount));
        storage.total_supply.write(new_supply);
    }
    // docs:end:reduce_total_supply

    // TODO: Can't read public state from private so asserting
    #[aztec(public)]
    #[aztec(internal)]
    fn _assert_note_counter_and_increment(note_counter: u32) {
        let stored_counter = storage.note_counter.read();
        assert(stored_counter == note_counter, "invalid note_counter");
        storage.note_counter.write(stored_counter + 1);
    }

    /// Unconstrained ///

    // docs:start:admin
    unconstrained fn admin() -> pub Field {
        storage.admin.read().to_field()
    }
    // docs:end:admin

    // docs:start:is_minter
    unconstrained fn is_minter(minter: AztecAddress) -> pub bool {
        storage.minters.at(minter).read()
    }
    // docs:end:is_minter

    // docs:start:total_supply
    unconstrained fn total_supply() -> pub Field {
        storage.total_supply.read().to_integer()
    }
    // docs:end:total_supply

    // docs:start:balance_of_private
    unconstrained fn balance_of_private(owner: AztecAddress) -> pub Field {
        storage.balances.balance_of(owner).to_integer()
    }
    // docs:end:balance_of_private

    // docs:start:balance_of_public
    unconstrained fn balance_of_public(owner: AztecAddress) -> pub Field {
        storage.public_balances.at(owner).read().to_integer()
    }
    // docs:end:balance_of_public

    unconstrained fn note_counter() -> pub u32 {
        storage.note_counter.read()
    }

    // At least one note has attestation.
    unconstrained fn has_attestation(owner: AztecAddress, attestor: AztecAddress) -> pub bool {
        storage.balances.has_attestation(owner, attestor)
    }

    unconstrained fn last_unattested_note(owner: AztecAddress, attestor: AztecAddress) -> pub Option<TokenNote> {
        storage.balances.last_unattested_note_unc(owner, attestor)
    }
}
// docs:end:token_all