import {
  AccountWallet,
  CompleteAddress,
  DebugLogger,
  ExtendedNote,
  PXE,
  Fr,
  FunctionSelector,
  Note,
  createDebugLogger,
  TxHash,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { decodeFunctionSignature } from '@aztec/foundation/abi';
import { DocsExampleContract, ReaderContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { BITSIZE_TOO_BIG_ERROR, U128_OVERFLOW_ERROR, U128_UNDERFLOW_ERROR } from './fixtures/fixtures.js';
import { setupEnvironment } from '../environment/index.js';
import { TokenSimulator } from './token_simulator.js';
import { AttestorContract } from '../artifacts/Attestor.js';
import { AttestorSimulator } from './attestor_simulator.js';
import { TokenContract } from '../artifacts/Token.js';

const TIMEOUT = 100_000;

describe('e2e_token_contract', () => {
  jest.setTimeout(TIMEOUT);

  const TOKEN_NAME = 'Aztec Token';
  const TOKEN_SYMBOL = 'AZT';
  const TOKEN_DECIMALS = 18n;
  const VEC_LEN = 10;
  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;
  let pxe: PXE;

  let asset: TokenContract;
  let badAccount: DocsExampleContract;
  let attestor: AttestorContract;

  let tokenSim: TokenSimulator;
  let attestorSim: AttestorSimulator;

  const addPendingShieldNoteToPXE = async (accountIndex: number, amount: bigint, secretHash: Fr, txHash: TxHash) => {
    const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
    const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote

    const note = new Note([new Fr(amount), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      accounts[accountIndex].address,
      asset.address,
      storageSlot,
      noteTypeId,
      txHash,
    );
    await wallets[accountIndex].addNote(extendedNote);
  };

  const toString = (val: bigint[]) => {
    let str = '';
    for (let i = 0; i < val.length; i++) {
      if (val[i] != 0n) {
        str += String.fromCharCode(Number(val[i]));
      }
    }
    return str;
  };

  beforeAll(async () => {
    logger = createDebugLogger('token');
    pxe = await setupEnvironment();

    accounts = await pxe.getRegisteredAccounts();
    wallets = await getInitialTestAccountsWallets(pxe);

    logger(`Accounts: ${accounts.map(a => a.toReadableString())}`);
    logger(`Wallets: ${wallets.map(w => w.getAddress().toString())}`);

    TokenContract.artifact.functions.forEach(fn => {
      const sig = decodeFunctionSignature(fn.name, fn.parameters);
      logger(`Function ${sig} and the selector: ${FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)}`);
    });

    asset = await TokenContract.deploy(wallets[0], accounts[0], TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
      .send()
      .deployed();
    logger(`Token deployed to ${asset.address}`);
    tokenSim = new TokenSimulator(
      asset,
      logger,
      accounts.map(a => a.address),
    );

    expect(await asset.methods.admin().view()).toBe(accounts[0].address.toBigInt());

    badAccount = await DocsExampleContract.deploy(wallets[0]).send().deployed();
  }, 100_000);

  afterEach(async () => {
    await tokenSim.check();
  }, TIMEOUT);

  describe('Reading constants', () => {
    let reader: ReaderContract;
    beforeAll(async () => {
      reader = await ReaderContract.deploy(wallets[0]).send().deployed();
    });

    describe('name', () => {
      it.each([
        ['private', 'check_name_private' as const, "Cannot satisfy constraint 'name.is_eq(_what)'"],
        [
          'public',
          'check_name_public' as const,
          "Failed to solve brillig function, reason: explicit trap hit in brillig 'name.is_eq(_what)'",
        ],
      ])('name - %s', async (_type, method, errorMessage) => {
        const t = toString(await asset.methods.un_get_name().view());
        expect(t).toBe(TOKEN_NAME);

        await reader.methods[method](asset.address, TOKEN_NAME).send().wait();
        await expect(reader.methods[method](asset.address, 'WRONG_NAME').simulate()).rejects.toThrow(errorMessage);
      });
    });

    describe('symbol', () => {
      it('private', async () => {
        const t = toString(await asset.methods.un_get_symbol().view());
        expect(t).toBe(TOKEN_SYMBOL);

        await reader.methods.check_symbol_private(asset.address, TOKEN_SYMBOL).send().wait();

        await expect(reader.methods.check_symbol_private(asset.address, 'WRONG_SYMBOL').simulate()).rejects.toThrow(
          "Cannot satisfy constraint 'symbol.is_eq(_what)'",
        );
      });
      it('public', async () => {
        const t = toString(await asset.methods.un_get_symbol().view());
        expect(t).toBe(TOKEN_SYMBOL);

        await reader.methods.check_symbol_public(asset.address, TOKEN_SYMBOL).send().wait();

        await expect(reader.methods.check_symbol_public(asset.address, 'WRONG_SYMBOL').simulate()).rejects.toThrow(
          "Failed to solve brillig function, reason: explicit trap hit in brillig 'symbol.is_eq(_what)'",
        );
      });
    });

    describe('decimals', () => {
      it('private', async () => {
        const t = await asset.methods.un_get_decimals().view();
        expect(t).toBe(TOKEN_DECIMALS);

        await reader.methods.check_decimals_private(asset.address, TOKEN_DECIMALS).send().wait();

        await expect(reader.methods.check_decimals_private(asset.address, 99).simulate()).rejects.toThrow(
          "Cannot satisfy constraint 'ret[0] as u8 == what'",
        );
      });

      it('public', async () => {
        const t = await asset.methods.un_get_decimals().view();
        expect(t).toBe(TOKEN_DECIMALS);

        await reader.methods.check_decimals_public(asset.address, TOKEN_DECIMALS).send().wait();

        await expect(reader.methods.check_decimals_public(asset.address, 99).simulate()).rejects.toThrow(
          "Failed to solve brillig function, reason: explicit trap hit in brillig 'ret[0] as u8 == what'",
        );
      });
    });
  });

  describe('Access controlled functions', () => {
    it('Set admin', async () => {
      await asset.methods.set_admin(accounts[1].address).send().wait();
      expect(await asset.methods.admin().view()).toBe(accounts[1].address.toBigInt());
    });

    it('Add minter as admin', async () => {
      await asset.withWallet(wallets[1]).methods.set_minter(accounts[1].address, true).send().wait();
      expect(await asset.methods.is_minter(accounts[1].address).view()).toBe(true);
    });

    it('Revoke minter as admin', async () => {
      await asset.withWallet(wallets[1]).methods.set_minter(accounts[1].address, false).send().wait();
      expect(await asset.methods.is_minter(accounts[1].address).view()).toBe(false);
    });

    describe('failure cases', () => {
      it('Set admin (not admin)', async () => {
        await expect(asset.methods.set_admin(accounts[0].address).simulate()).rejects.toThrow(
          'Assertion failed: caller is not admin',
        );
      });
      it('Revoke minter not as admin', async () => {
        await expect(asset.methods.set_minter(accounts[0].address, false).simulate()).rejects.toThrow(
          'Assertion failed: caller is not admin',
        );
      });
    });
  });

  describe('Minting', () => {
    describe('Public', () => {
      it('as minter', async () => {
        const amount = 10000n;
        await asset.methods.mint_public(accounts[0].address, amount).send().wait();

        tokenSim.mintPublic(accounts[0].address, amount);
        expect(await asset.methods.balance_of_public(accounts[0].address).view()).toEqual(
          tokenSim.balanceOfPublic(accounts[0].address),
        );
        expect(await asset.methods.total_supply().view()).toEqual(tokenSim.totalSupply);
      });

      describe('failure cases', () => {
        it('as non-minter', async () => {
          const amount = 10000n;
          await expect(
            asset.withWallet(wallets[1]).methods.mint_public(accounts[0].address, amount).simulate(),
          ).rejects.toThrow('Assertion failed: caller is not minter');
        });

        it('mint >u128 tokens to overflow', async () => {
          const amount = 2n ** 128n; // U128::max() + 1;
          await expect(asset.methods.mint_public(accounts[0].address, amount).simulate()).rejects.toThrow(
            BITSIZE_TOO_BIG_ERROR,
          );
        });

        it('mint <u128 but recipient balance >u128', async () => {
          const amount = 2n ** 128n - tokenSim.balanceOfPublic(accounts[0].address);
          await expect(asset.methods.mint_public(accounts[0].address, amount).simulate()).rejects.toThrow(
            U128_OVERFLOW_ERROR,
          );
        });

        it('mint <u128 but such that total supply >u128', async () => {
          const amount = 2n ** 128n - tokenSim.balanceOfPublic(accounts[0].address);
          await expect(asset.methods.mint_public(accounts[1].address, amount).simulate()).rejects.toThrow(
            U128_OVERFLOW_ERROR,
          );
        });
      });
    });

    describe('Private', () => {
      const secret = Fr.random();
      const amount = 10000n;
      let secretHash: Fr;
      let txHash: TxHash;

      beforeAll(() => {
        secretHash = computeMessageSecretHash(secret);
      });

      describe('Mint flow', () => {
        it('mint_private as minter', async () => {
          const receipt = await asset.methods.mint_private(amount, secretHash).send().wait();
          tokenSim.mintPrivate(amount);
          txHash = receipt.txHash;
        });

        it('redeem as recipient', async () => {
          await addPendingShieldNoteToPXE(0, amount, secretHash, txHash);
          const txClaim = asset.methods.redeem_shield(accounts[0].address, amount, secret).send();
          // docs:start:debug
          const receiptClaim = await txClaim.wait({ debug: true });
          // docs:end:debug
          tokenSim.redeemShield(accounts[0].address, amount);
          // 1 note should be created containing `amount` of tokens
          const { visibleNotes } = receiptClaim.debugInfo!;
          console.log(receiptClaim.debugInfo);
          expect(visibleNotes.length).toBe(1);
          expect(visibleNotes[0].note.items[0].toBigInt()).toBe(amount);
        });
      });

      describe('failure cases', () => {
        it('try to redeem as recipient (double-spend) [REVERTS]', async () => {
          await expect(addPendingShieldNoteToPXE(0, amount, secretHash, txHash)).rejects.toThrow(
            'The note has been destroyed.',
          );
          await expect(asset.methods.redeem_shield(accounts[0].address, amount, secret).simulate()).rejects.toThrow(
            'Can only remove a note that has been read from the set.',
          );
        });

        it('mint_private as non-minter', async () => {
          await expect(
            asset.withWallet(wallets[1]).methods.mint_private(amount, secretHash).simulate(),
          ).rejects.toThrow('Assertion failed: caller is not minter');
        });

        it('mint >u128 tokens to overflow', async () => {
          const amount = 2n ** 128n; // U128::max() + 1;
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrow(
            BITSIZE_TOO_BIG_ERROR,
          );
        });

        it('mint <u128 but recipient balance >u128', async () => {
          const amount = 2n ** 128n - tokenSim.balanceOfPrivate(accounts[0].address);
          expect(amount).toBeLessThan(2n ** 128n);
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrow(U128_OVERFLOW_ERROR);
        });

        it('mint <u128 but such that total supply >u128', async () => {
          const amount = 2n ** 128n - tokenSim.totalSupply;
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrow(U128_OVERFLOW_ERROR);
        });
      });
    });
  });

  describe('Transfer', () => {
    describe('public', () => {
      it('transfer less than balance', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        await asset.methods.transfer_public(accounts[0].address, accounts[1].address, amount, 0).send().wait();

        tokenSim.transferPublic(accounts[0].address, accounts[1].address, amount);
      });

      it('transfer to self', async () => {
        const balance = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance / 2n;
        expect(amount).toBeGreaterThan(0n);
        await asset.methods.transfer_public(accounts[0].address, accounts[0].address, amount, 0).send().wait();

        tokenSim.transferPublic(accounts[0].address, accounts[0].address, amount);
      });

      it('transfer on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const nonce = Fr.random();

        // docs:start:authwit_public_transfer_example
        const action = asset
          .withWallet(wallets[1])
          .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce);

        await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();
        // docs:end:authwit_public_transfer_example

        // Perform the transfer
        await action.send().wait();

        tokenSim.transferPublic(accounts[0].address, accounts[1].address, amount);

        // Check that the message hash is no longer valid. Need to try to send since nullifiers are handled by sequencer.
        const txReplay = asset
          .withWallet(wallets[1])
          .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce)
          .send();
        await expect(txReplay.wait()).rejects.toThrow('Transaction ');
      });

      describe('failure cases', () => {
        it('transfer more than balance', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = 0;
          await expect(
            asset.methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce).simulate(),
          ).rejects.toThrow(U128_UNDERFLOW_ERROR);
        });

        it('transfer on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 - 1n;
          const nonce = 1;
          await expect(
            asset.methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce).simulate(),
          ).rejects.toThrow('Assertion failed: invalid nonce');
        });

        it('transfer on behalf of other without "approval"', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          await expect(
            asset
              .withWallet(wallets[1])
              .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce)
              .simulate(),
          ).rejects.toThrow('Assertion failed: Message not authorized by account');
        });

        it('transfer more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const balance1 = await asset.methods.balance_of_public(accounts[1].address).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          const action = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce);

          // We need to compute the message we want to sign and add it to the wallet as approved
          await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();

          // Perform the transfer
          await expect(action.simulate()).rejects.toThrow(U128_UNDERFLOW_ERROR);

          expect(await asset.methods.balance_of_public(accounts[0].address).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_public(accounts[1].address).view()).toEqual(balance1);
        });

        it('transfer on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const balance1 = await asset.methods.balance_of_public(accounts[1].address).view();
          const amount = balance0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce);

          await wallets[0].setPublicAuthWit({ caller: accounts[0].address, action }, true).send().wait();

          // Perform the transfer
          await expect(action.simulate()).rejects.toThrow('Assertion failed: Message not authorized by account');

          expect(await asset.methods.balance_of_public(accounts[0].address).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_public(accounts[1].address).view()).toEqual(balance1);
        });

        it('transfer on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const balance1 = await asset.methods.balance_of_public(accounts[1].address).view();
          const amount = balance0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce);
          await wallets[0].setPublicAuthWit({ caller: accounts[0].address, action }, true).send().wait();

          // Perform the transfer
          await expect(action.simulate()).rejects.toThrow('Assertion failed: Message not authorized by account');

          expect(await asset.methods.balance_of_public(accounts[0].address).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_public(accounts[1].address).view()).toEqual(balance1);
        });

        it('transfer on behalf of other, cancelled authwit', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 / 2n;
          expect(amount).toBeGreaterThan(0n);
          const nonce = Fr.random();

          const action = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce);

          await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();

          await wallets[0].cancelAuthWit({ caller: accounts[1].address, action }).send().wait();

          // Check that the authwit is no longer valid. Need to try to send since nullifiers are handled by sequencer.
          const txCancelledAuthwit = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce)
            .send();
          await expect(txCancelledAuthwit.wait()).rejects.toThrowError('Transaction ');
        });

        it('transfer on behalf of other, cancelled authwit, flow 2', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 / 2n;
          expect(amount).toBeGreaterThan(0n);
          const nonce = Fr.random();

          const action = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce);

          await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();

          await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, false).send().wait();

          // Check that the authwit is no longer valid. Need to try to send since nullifiers are handled by sequencer.
          const txCancelledAuthwit = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce)
            .send();
          await expect(txCancelledAuthwit.wait()).rejects.toThrowError('Transaction ');
        });

        it('transfer on behalf of other, cancelled authwit, flow 3', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 / 2n;
          expect(amount).toBeGreaterThan(0n);
          const nonce = Fr.random();

          const action = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce);
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

          await wallets[0].setPublicAuthWit(messageHash, true).send().wait();

          await wallets[0].cancelAuthWit(messageHash).send().wait();

          // Check that the message hash is no longer valid. Need to try to send since nullifiers are handled by sequencer.
          const txCancelledAuthwit = asset
            .withWallet(wallets[1])
            .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce)
            .send();
          await expect(txCancelledAuthwit.wait()).rejects.toThrow('Transaction ');
        });

        it('transfer on behalf of other, invalid spend_public_authwit on "from"', async () => {
          const nonce = Fr.random();

          // Should fail as the returned value from the badAccount is malformed
          const txCancelledAuthwit = asset
            .withWallet(wallets[1])
            .methods.transfer_public(badAccount.address, accounts[1].address, 0, nonce)
            .send();
          await expect(txCancelledAuthwit.wait()).rejects.toThrow(
            "Assertion failed: Message not authorized by account 'result == IS_VALID_SELECTOR'",
          );
        });

        it.skip('transfer into account to overflow', () => {
          // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
          // a way to get funds enough to overflow.
          // Require direct storage manipulation for us to perform a nice explicit case though.
          // See https://github.com/AztecProtocol/aztec-packages/issues/1259
        });
      });
    });

    describe('private', () => {
      it('transfer less than balance', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        await asset.methods.transfer(accounts[0].address, accounts[1].address, amount, 0).send().wait();
        tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);
      });

      it('transfer to self', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        await asset.methods.transfer(accounts[0].address, accounts[0].address, amount, 0).send().wait();
        tokenSim.transferPrivate(accounts[0].address, accounts[0].address, amount);
      });

      it('transfer on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        // docs:start:authwit_transfer_example
        // docs:start:authwit_computeAuthWitMessageHash
        const action = asset
          .withWallet(wallets[1])
          .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce);

        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[1].addAuthWitness(witness);
        // docs:end:authwit_transfer_example

        // Perform the transfer
        await action.send().wait();
        tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);

        // Perform the transfer again, should fail
        const txReplay = asset
          .withWallet(wallets[1])
          .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce)
          .send();
        await expect(txReplay.wait()).rejects.toThrow('Transaction ');
      });

      describe('failure cases', () => {
        it('transfer more than balance', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(
            asset.methods.transfer(accounts[0].address, accounts[1].address, amount, 0).simulate(),
          ).rejects.toThrow('Assertion failed: Balance too low');
        });

        it('transfer on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(
            asset.methods.transfer(accounts[0].address, accounts[1].address, amount, 1).simulate(),
          ).rejects.toThrow('Assertion failed: invalid nonce');
        });

        it('transfer more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const balance1 = await asset.methods.balance_of_private(accounts[1].address).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset
            .withWallet(wallets[1])
            .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce);

          // Both wallets are connected to same node and PXE so we could just insert directly using
          // await wallet.signAndAddAuthWitness(messageHash, );
          // But doing it in two actions to show the flow.
          const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
          await wallets[1].addAuthWitness(witness);

          // Perform the transfer
          await expect(action.simulate()).rejects.toThrow('Assertion failed: Balance too low');
          expect(await asset.methods.balance_of_private(accounts[0].address).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_private(accounts[1].address).view()).toEqual(balance1);
        });

        it.skip('transfer into account to overflow', () => {
          // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
          // a way to get funds enough to overflow.
          // Require direct storage manipulation for us to perform a nice explicit case though.
          // See https://github.com/AztecProtocol/aztec-packages/issues/1259
        });

        it('transfer on behalf of other without approval', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset
            .withWallet(wallets[1])
            .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce);
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

          await expect(action.simulate()).rejects.toThrow(
            `Unknown auth witness for message hash ${messageHash.toString()}`,
          );
        });

        it('transfer on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset
            .withWallet(wallets[2])
            .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce);
          const expectedMessageHash = computeAuthWitMessageHash(accounts[2].address, action.request());

          const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
          await wallets[2].addAuthWitness(witness);

          await expect(action.simulate()).rejects.toThrow(
            `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
          );
          expect(await asset.methods.balance_of_private(accounts[0].address).view()).toEqual(balance0);
        });

        it('transfer on behalf of other, cancelled authwit', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset
            .withWallet(wallets[1])
            .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce);

          const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
          await wallets[1].addAuthWitness(witness);

          await wallets[0].cancelAuthWit(witness.requestHash).send().wait();

          // Perform the transfer, should fail because nullifier already emitted
          const txCancelledAuthwit = asset
            .withWallet(wallets[1])
            .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce)
            .send();
          await expect(txCancelledAuthwit.wait()).rejects.toThrowError('Transaction ');
        });

        it('transfer on behalf of other, cancelled authwit, flow 2', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset
            .withWallet(wallets[1])
            .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce);

          const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
          await wallets[1].addAuthWitness(witness);

          await wallets[0].cancelAuthWit({ caller: accounts[1].address, action }).send().wait();

          // Perform the transfer, should fail because nullifier already emitted
          const txCancelledAuthwit = asset
            .withWallet(wallets[1])
            .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce)
            .send();
          await expect(txCancelledAuthwit.wait()).rejects.toThrow('Transaction ');
        });

        it('transfer on behalf of other, invalid spend_private_authwit on "from"', async () => {
          const nonce = Fr.random();

          // Should fail as the returned value from the badAccount is malformed
          const txCancelledAuthwit = asset
            .withWallet(wallets[1])
            .methods.transfer(badAccount.address, accounts[1].address, 0, nonce)
            .send();
          await expect(txCancelledAuthwit.wait()).rejects.toThrow(
            "Assertion failed: Message not authorized by account 'result == IS_VALID_SELECTOR'",
          );
        });
      });
    });
  });

  describe('Shielding (shield + redeem_shield)', () => {
    const secret = Fr.random();
    let secretHash: Fr;

    beforeAll(() => {
      secretHash = computeMessageSecretHash(secret);
    });

    it('on behalf of self', async () => {
      const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
      const amount = balancePub / 2n;
      expect(amount).toBeGreaterThan(0n);

      const receipt = await asset.methods.shield(accounts[0].address, amount, secretHash, 0).send().wait();

      tokenSim.shield(accounts[0].address, amount);
      await tokenSim.check();

      // Redeem it
      await addPendingShieldNoteToPXE(0, amount, secretHash, receipt.txHash);
      await asset.methods.redeem_shield(accounts[0].address, amount, secret).send().wait();

      tokenSim.redeemShield(accounts[0].address, amount);
    });

    it('on behalf of other', async () => {
      const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
      const amount = balancePub / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(wallets[1]).methods.shield(accounts[0].address, amount, secretHash, nonce);
      await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();

      const receipt = await action.send().wait();

      tokenSim.shield(accounts[0].address, amount);
      await tokenSim.check();

      // Check that replaying the shield should fail!
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.shield(accounts[0].address, amount, secretHash, nonce)
        .send();
      await expect(txReplay.wait()).rejects.toThrow('Transaction ');

      // Redeem it
      await addPendingShieldNoteToPXE(0, amount, secretHash, receipt.txHash);
      await asset.methods.redeem_shield(accounts[0].address, amount, secret).send().wait();

      tokenSim.redeemShield(accounts[0].address, amount);
    });

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balancePub + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(asset.methods.shield(accounts[0].address, amount, secretHash, 0).simulate()).rejects.toThrow(
          U128_UNDERFLOW_ERROR,
        );
      });

      it('on behalf of self (invalid nonce)', async () => {
        const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balancePub + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(asset.methods.shield(accounts[0].address, amount, secretHash, 1).simulate()).rejects.toThrow(
          'Assertion failed: invalid nonce',
        );
      });

      it('on behalf of other (more than balance)', async () => {
        const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balancePub + 1n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.shield(accounts[0].address, amount, secretHash, nonce);
        await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();

        await expect(action.simulate()).rejects.toThrow(U128_UNDERFLOW_ERROR);
      });

      it('on behalf of other (wrong designated caller)', async () => {
        const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balancePub + 1n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[2]).methods.shield(accounts[0].address, amount, secretHash, nonce);
        await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();

        await expect(action.simulate()).rejects.toThrow('Assertion failed: Message not authorized by account');
      });

      it('on behalf of other (without approval)', async () => {
        const balance = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.withWallet(wallets[1]).methods.shield(accounts[0].address, amount, secretHash, nonce).simulate(),
        ).rejects.toThrow(`Assertion failed: Message not authorized by account`);
      });
    });
  });

  describe('Unshielding', () => {
    it('on behalf of self', async () => {
      const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
      const amount = balancePriv / 2n;
      expect(amount).toBeGreaterThan(0n);

      await asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 0).send().wait();

      tokenSim.unshield(accounts[0].address, accounts[0].address, amount);
    });

    it('on behalf of other', async () => {
      const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).view();
      const amount = balancePriv0 / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset
        .withWallet(wallets[1])
        .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce);

      // Both wallets are connected to same node and PXE so we could just insert directly
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
      await wallets[1].addAuthWitness(witness);

      await action.send().wait();
      tokenSim.unshield(accounts[0].address, accounts[1].address, amount);

      // Perform the transfer again, should fail
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce)
        .send();
      await expect(txReplay.wait()).rejects.toThrow('Transaction ');
    });

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 0).simulate(),
        ).rejects.toThrow('Assertion failed: Balance too low');
      });

      it('on behalf of self (invalid nonce)', async () => {
        const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 1).simulate(),
        ).rejects.toThrow('Assertion failed: invalid nonce');
      });

      it('on behalf of other (more than balance)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv0 + 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[1])
          .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce);

        // Both wallets are connected to same node and PXE so we could just insert directly
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[1].addAuthWitness(witness);

        await expect(action.simulate()).rejects.toThrow('Assertion failed: Balance too low');
      });

      it('on behalf of other (invalid designated caller)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv0 + 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[2])
          .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce);
        const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
        const expectedMessageHash = computeAuthWitMessageHash(accounts[2].address, action.request());

        // Both wallets are connected to same node and PXE so we could just insert directly
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[2].addAuthWitness(witness);

        await expect(action.simulate()).rejects.toThrow(
          `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
        );
      });
    });
  });

  describe('Burn', () => {
    describe('public', () => {
      it('burn less than balance', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        await asset.methods.burn_public(accounts[0].address, amount, 0).send().wait();

        tokenSim.burnPublic(accounts[0].address, amount);
      });

      it('burn on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const nonce = Fr.random();

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce);
        await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();

        await action.send().wait();

        tokenSim.burnPublic(accounts[0].address, amount);

        // Check that the message hash is no longer valid. Need to try to send since nullifiers are handled by sequencer.
        const txReplay = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce).send();
        await expect(txReplay.wait()).rejects.toThrow('Transaction ');
      });

      describe('failure cases', () => {
        it('burn more than balance', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = 0;
          await expect(asset.methods.burn_public(accounts[0].address, amount, nonce).simulate()).rejects.toThrow(
            U128_UNDERFLOW_ERROR,
          );
        });

        it('burn on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          const nonce = 1;
          await expect(asset.methods.burn_public(accounts[0].address, amount, nonce).simulate()).rejects.toThrow(
            'Assertion failed: invalid nonce',
          );
        });

        it('burn on behalf of other without "approval"', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          await expect(
            asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce).simulate(),
          ).rejects.toThrow('Assertion failed: Message not authorized by account');
        });

        it('burn more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce);
          await wallets[0].setPublicAuthWit({ caller: accounts[1].address, action }, true).send().wait();

          await expect(action.simulate()).rejects.toThrow(U128_UNDERFLOW_ERROR);
        });

        it('burn on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce);
          await wallets[0].setPublicAuthWit({ caller: accounts[0].address, action }, true).send().wait();

          await expect(
            asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce).simulate(),
          ).rejects.toThrow('Assertion failed: Message not authorized by account');
        });
      });
    });

    describe('private', () => {
      it('burn less than balance', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        await asset.methods.burn(accounts[0].address, amount, 0).send().wait();
        tokenSim.burnPrivate(accounts[0].address, amount);
      });

      it('burn on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce);

        // Both wallets are connected to same node and PXE so we could just insert directly
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[1].addAuthWitness(witness);

        await asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce).send().wait();
        tokenSim.burnPrivate(accounts[0].address, amount);

        // Perform the transfer again, should fail
        const txReplay = asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce).send();
        await expect(txReplay.wait()).rejects.toThrow('Transaction ');
      });

      describe('failure cases', () => {
        it('burn more than balance', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(asset.methods.burn(accounts[0].address, amount, 0).simulate()).rejects.toThrow(
            'Assertion failed: Balance too low',
          );
        });

        it('burn on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(asset.methods.burn(accounts[0].address, amount, 1).simulate()).rejects.toThrow(
            'Assertion failed: invalid nonce',
          );
        });

        it('burn more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce);

          // Both wallets are connected to same node and PXE so we could just insert directly
          // But doing it in two actions to show the flow.
          const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
          await wallets[1].addAuthWitness(witness);

          await expect(action.simulate()).rejects.toThrow('Assertion failed: Balance too low');
        });

        it('burn on behalf of other without approval', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce);
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

          await expect(action.simulate()).rejects.toThrow(
            `Unknown auth witness for message hash ${messageHash.toString()}`,
          );
        });

        it('on behalf of other (invalid designated caller)', async () => {
          const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balancePriv0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[2]).methods.burn(accounts[0].address, amount, nonce);
          const expectedMessageHash = computeAuthWitMessageHash(accounts[2].address, action.request());

          const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
          await wallets[2].addAuthWitness(witness);

          await expect(action.simulate()).rejects.toThrow(
            `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
          );
        });
      });
    });
  });

  describe('Attestations', () => {
    const secret = Fr.random();
    const amount = 10000n;
    const shieldId = 0n;
    let secretHash: Fr;
    let txHash: TxHash;

    let shieldIds = Array(VEC_LEN).fill(0n);
    shieldIds[0] = shieldId;

    describe('No transfers', () => {
      beforeEach(async () => {
        asset = await TokenContract.deploy(wallets[0], accounts[0], TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
          .send()
          .deployed();
        logger(`Token deployed to ${asset.address}`);
        tokenSim = new TokenSimulator(
          asset,
          logger,
          accounts.map(a => a.address),
        );
        expect(await asset.methods.admin().view()).toBe(accounts[0].address.toBigInt());

        secretHash = computeMessageSecretHash(secret);
        const receipt = await asset.methods.mint_private(amount, secretHash).send().wait();

        tokenSim.mintPrivate(amount);
        txHash = receipt.txHash;
        await addPendingShieldNoteToPXE(0, amount, secretHash, txHash);

        await asset.methods.redeem_shield(accounts[0].address, amount, secret).send().wait();
        tokenSim.redeemShield(accounts[0].address, amount);

        attestor = await AttestorContract.deploy(wallets[0], accounts[0].address).send().deployed();
        logger(`Attestor deployed to ${attestor.address}`);
        attestorSim = new AttestorSimulator();
      }, 100_000);

      it('Has attestation', async () => {
        expect(await asset.methods.has_attestation(accounts[0].address, attestor.address).view()).toBe(false);
      });

      it('Request attestation', async () => {
        let root = await attestor.methods.get_blacklist_root(accounts[0]).view();
        const proofs = await attestorSim.getSiblingPaths(asset.address, shieldIds);

        await asset.methods
          .request_attestation(accounts[0].address, attestor.address, root, proofs.flat(), 0)
          .send()
          .wait();

        expect(await asset.methods.has_attestation(accounts[0].address, attestor.address).view()).toBe(true);
      });

      it('Request attestation after blacklisting', async () => {
        const proof1 = await attestorSim.getSiblingPath(asset.address, shieldId);
        expect(await attestor.methods.is_not_blacklisted(asset.address, shieldId, proof1).view()).toEqual(true);

        await attestor.methods.add_to_blacklist(asset.address, shieldId, proof1).send().wait();
        await attestorSim.addToBlacklist(asset.address, shieldId);

        const proof2 = await attestorSim.getSiblingPath(asset.address, shieldId);
        expect(await attestor.methods.is_not_blacklisted(asset.address, shieldId, proof2).view()).toEqual(false);

        let root = await attestor.methods.get_blacklist_root(asset.address).view();
        const proofs = await attestorSim.getSiblingPaths(asset.address, shieldIds);

        await asset.methods
          .request_attestation(accounts[0].address, attestor.address, root, proofs.flat(), 0)
          .send()
          .wait();

        expect(await asset.methods.has_attestation(accounts[0].address, attestor.address).view()).toBe(false);
      });
    });

    describe('Partial transfers', () => {
      let account1: CompleteAddress;
      let account2: CompleteAddress;
      let wallet1: AccountWallet;
      let wallet2: AccountWallet;

      beforeEach(async () => {
        asset = await TokenContract.deploy(wallets[0], accounts[0], TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
          .send()
          .deployed();
        logger(`Token deployed to ${asset.address}`);
        tokenSim = new TokenSimulator(
          asset,
          logger,
          accounts.map(a => a.address),
        );
        expect(await asset.methods.admin().view()).toBe(accounts[0].address.toBigInt());

        secretHash = computeMessageSecretHash(secret);
        const receipt = await asset.methods.mint_private(amount, secretHash).send().wait();

        tokenSim.mintPrivate(amount);
        txHash = receipt.txHash;
        await addPendingShieldNoteToPXE(0, amount, secretHash, txHash);

        await asset.methods.redeem_shield(accounts[0].address, amount, secret).send().wait();
        tokenSim.redeemShield(accounts[0].address, amount);

        attestor = await AttestorContract.deploy(wallets[0], accounts[0].address).send().deployed();
        logger(`Attestor deployed to ${attestor.address}`);
        attestorSim = new AttestorSimulator();

        account1 = accounts[0];
        account2 = accounts[1];
        wallet1 = wallets[0];
        wallet2 = wallets[1];
      }, 100_000);

      it('Attestation transfer', async () => {
        let root = await attestor.methods.get_blacklist_root(asset.address).view();
        const proofs = await attestorSim.getSiblingPaths(asset.address, shieldIds);

        await asset
          .withWallet(wallet1)
          .methods.request_attestation(account1, attestor.address, root, proofs.flat(), 0)
          .send()
          .wait();

        expect(await asset.methods.has_attestation(account1, attestor.address).view()).toBe(true);
        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(false);

        const balance0 = await asset.methods.balance_of_private(account1).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        await asset.withWallet(wallet1).methods.transfer(account1, account2, amount, 0).send().wait();
        tokenSim.transferPrivate(account1.address, account2.address, amount);

        expect(await asset.methods.has_attestation(account1, attestor.address).view()).toBe(true);
        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(true);
      });

      it('Deposit ID transfer', async () => {
        const proof1 = await attestorSim.getSiblingPath(asset.address, shieldId);
        expect(await attestor.methods.is_not_blacklisted(asset.address, shieldId, proof1).view()).toEqual(true);

        await attestor.methods.add_to_blacklist(asset.address, shieldId, proof1).send().wait();
        await attestorSim.addToBlacklist(asset.address, shieldId);

        let root2 = await attestor.methods.get_blacklist_root(asset.address).view();
        const proof2 = await attestorSim.getSiblingPath(asset.address, shieldId);
        expect(await attestor.methods.is_not_blacklisted(asset.address, shieldId, proof2).view()).toEqual(false);

        const balance0 = await asset.methods.balance_of_private(account1).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        await asset.withWallet(wallet1).methods.transfer(account1, account2, amount, 0).send().wait();
        tokenSim.transferPrivate(account1.address, account2.address, amount);

        // const tx4 = asset.withWallet(wallet1).methods.request_attestation(account1, attestor.address, root2, proof2, 0).send();

        // Request attestation should fail i.e. not add any attestation
        const proofs = await attestorSim.getSiblingPaths(asset.address, shieldIds);
        await asset
          .withWallet(wallet2)
          .methods.request_attestation(account2, attestor.address, root2, proofs.flat(), 0)
          .send()
          .wait();

        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(false);
      });
    });

    describe('Full transfers', () => {
      let account1: CompleteAddress;
      let account2: CompleteAddress;
      let wallet1: AccountWallet;
      let wallet2: AccountWallet;

      beforeEach(async () => {
        asset = await TokenContract.deploy(wallets[0], accounts[0], TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
          .send()
          .deployed();
        logger(`Token deployed to ${asset.address}`);
        tokenSim = new TokenSimulator(
          asset,
          logger,
          accounts.map(a => a.address),
        );
        expect(await asset.methods.admin().view()).toBe(accounts[0].address.toBigInt());

        secretHash = computeMessageSecretHash(secret);
        const receipt = await asset.methods.mint_private(amount, secretHash).send().wait();

        tokenSim.mintPrivate(amount);
        txHash = receipt.txHash;
        await addPendingShieldNoteToPXE(0, amount, secretHash, txHash);

        await asset.methods.redeem_shield(accounts[0].address, amount, secret).send().wait();
        tokenSim.redeemShield(accounts[0].address, amount);

        attestor = await AttestorContract.deploy(wallets[0], accounts[0].address).send().deployed();
        logger(`Attestor deployed to ${attestor.address}`);
        attestorSim = new AttestorSimulator();

        account1 = accounts[0];
        account2 = accounts[1];
        wallet1 = wallets[0];
        wallet2 = wallets[1];
      }, 100_000);

      it('Attestation transfer', async () => {
        let root = await attestor.methods.get_blacklist_root(asset.address).view();
        const proofs = await attestorSim.getSiblingPaths(asset.address, shieldIds);

        await asset
          .withWallet(wallet1)
          .methods.request_attestation(account1, attestor.address, root, proofs.flat(), 0)
          .send()
          .wait();

        expect(await asset.methods.has_attestation(account1, attestor.address).view()).toBe(true);
        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(false);

        const balance0 = await asset.methods.balance_of_private(account1).view();
        const amount = balance0;
        expect(amount).toBeGreaterThan(0n);
        await asset.withWallet(wallet1).methods.transfer(account1, account2, amount, 0).send().wait();
        tokenSim.transferPrivate(account1.address, account2.address, amount);

        expect(await asset.methods.has_attestation(account1, attestor.address).view()).toBe(false);
        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(true);
      });
    });
  });
});
