import { AttestorContract } from '../artifacts/Attestor.js';
import { AttestorSimulator } from './attestor_simulator.js';
import { TokenContract } from '../artifacts/Token.js';
import { TokenSimulator } from './token_simulator.js';
import {
  AccountWallet,
  AztecAddress,
  CompleteAddress,
  DebugLogger,
  ExtendedNote,
  Fr,
  Note,
  PXE,
  TxHash,
  TxStatus,
  Wallet,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
  createDebugLogger,
} from '@aztec/aztec.js';

import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';

import { afterEach, beforeAll, expect, jest } from '@jest/globals';
import { setupEnvironment } from '../environment/index.js';

const TIMEOUT = 60_000;
const VEC_LEN = 10;
const TOKEN_NAME = 'Aztec Token';
const TOKEN_SYMBOL = 'AZT';
const TOKEN_DECIMALS = 18n;

describe('e2e_token_contract', () => {
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  let asset: TokenContract;
  let attestor: AttestorContract;

  let attestorSim: AttestorSimulator;
  let tokenSim: TokenSimulator;
  let pxe: PXE;

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

  beforeAll(async () => {
    logger = createDebugLogger('box:token_contract_test');
    pxe = await setupEnvironment();
    // wallets = await createAccounts(pxe, 3);
    accounts = await pxe.getRegisteredAccounts();
    wallets = await getInitialTestAccountsWallets(pxe);

    logger(`Accounts: ${accounts.map(a => a.toReadableString())}`);
    logger(`Wallets: ${wallets.map(w => w.getAddress().toString())}`);

    asset = await TokenContract.deploy(wallets[0], accounts[0].address).send().deployed();
    logger(`Token deployed to ${asset.address}`);
    tokenSim = new TokenSimulator(
      asset,
      logger,
      accounts.map(a => a.address),
    );

    expect(await asset.methods.admin().view()).toBe(accounts[0].address.toBigInt());
  }, 100_000);

  afterEach(async () => {
    await tokenSim.check();
  }, TIMEOUT);

  describe('Access controlled functions', () => {
    it('Set admin', async () => {
      const tx = asset.methods.set_admin(accounts[1].address).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.admin().view()).toBe(accounts[1].address.toBigInt());
    });

    it('Add minter as admin', async () => {
      const tx = asset.withWallet(wallets[1]).methods.set_minter(accounts[1].address, true).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.is_minter(accounts[1].address).view()).toBe(true);
    });

    it('Revoke minter as admin', async () => {
      const tx = asset.withWallet(wallets[1]).methods.set_minter(accounts[1].address, false).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.is_minter(accounts[1].address).view()).toBe(false);
    });

    describe('failure cases', () => {
      it('Set admin (not admin)', async () => {
        await expect(asset.methods.set_admin(accounts[0].address).simulate()).rejects.toThrowError(
          'Assertion failed: caller is not admin',
        );
      });
      it('Revoke minter not as admin', async () => {
        await expect(asset.methods.set_minter(accounts[0].address, false).simulate()).rejects.toThrowError(
          'Assertion failed: caller is not admin',
        );
      });
    });
  });

  describe('Minting', () => {
    describe('Public', () => {
      it('as minter', async () => {
        const amount = 10000n;
        const tx = asset.methods.mint_public(accounts[0].address, amount).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

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
          ).rejects.toThrowError('Assertion failed: caller is not minter');
        });

        it('mint >u120 tokens to overflow', async () => {
          const amount = 2n ** 120n; // SafeU120::max() + 1;
          await expect(asset.methods.mint_public(accounts[0].address, amount).simulate()).rejects.toThrowError(
            'Assertion failed: Value too large for SafeU120',
          );
        });

        it('mint <u120 but recipient balance >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPublic(accounts[0].address);
          await expect(asset.methods.mint_public(accounts[0].address, amount).simulate()).rejects.toThrowError(
            'Assertion failed: Overflow',
          );
        });

        it('mint <u120 but such that total supply >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPublic(accounts[0].address);
          await expect(asset.methods.mint_public(accounts[1].address, amount).simulate()).rejects.toThrowError(
            'Assertion failed: Overflow',
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
          const tx = asset.methods.mint_private(amount, secretHash).send();
          const receipt = await tx.wait();
          expect(receipt.status).toBe(TxStatus.MINED);
          tokenSim.mintPrivate(amount);
          txHash = receipt.txHash;
        });

        it('redeem as recipient', async () => {
          await addPendingShieldNoteToPXE(0, amount, secretHash, txHash);
          const txClaim = asset.methods.redeem_shield(accounts[0].address, amount, secret).send();
          const receiptClaim = await txClaim.wait();
          expect(receiptClaim.status).toBe(TxStatus.MINED);
          tokenSim.redeemShield(accounts[0].address, amount);

          expect(await asset.methods.num_shields().view()).toEqual(1n);
        });
      });

      describe('failure cases', () => {
        it('try to redeem as recipient (double-spend) [REVERTS]', async () => {
          await expect(addPendingShieldNoteToPXE(0, amount, secretHash, txHash)).rejects.toThrowError(
            'The note has been destroyed.',
          );
          await expect(
            asset.methods.redeem_shield(accounts[0].address, amount, secret).simulate(),
          ).rejects.toThrowError('Can only remove a note that has been read from the set.');
        });

        it('mint_private as non-minter', async () => {
          await expect(
            asset.withWallet(wallets[1]).methods.mint_private(amount, secretHash).simulate(),
          ).rejects.toThrowError('Assertion failed: caller is not minter');
        });

        it('mint >u120 tokens to overflow', async () => {
          const amount = 2n ** 120n; // SafeU120::max() + 1;
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrowError(
            'Assertion failed: Value too large for SafeU120',
          );
        });

        it('mint <u120 but recipient balance >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPrivate(accounts[0].address);
          expect(amount).toBeLessThan(2n ** 120n);
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrowError(
            'Assertion failed: Overflow',
          );
        });

        it('mint <u120 but such that total supply >u120', async () => {
          const amount = 2n ** 120n - tokenSim.totalSupply;
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrowError(
            'Assertion failed: Overflow',
          );
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
        const tx = asset.methods.transfer_public(accounts[0].address, accounts[1].address, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.transferPublic(accounts[0].address, accounts[1].address, amount);
      });

      it('transfer to self', async () => {
        const balance = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods.transfer_public(accounts[0].address, accounts[0].address, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

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
        const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

        await wallets[0].setPublicAuth(messageHash, true).send().wait();
        // docs:end:authwit_public_transfer_example

        // Perform the transfer
        const tx = action.send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.transferPublic(accounts[0].address, accounts[1].address, amount);

        // Check that the message hash is no longer valid. Need to try to send since nullifiers are handled by sequencer.
        const txReplay = asset
          .withWallet(wallets[1])
          .methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce)
          .send();
        await expect(txReplay.wait()).rejects.toThrowError('Transaction ');
      });

      describe('failure cases', () => {
        it('transfer more than balance', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = 0;
          await expect(
            asset.methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: Underflow');
        });

        it('transfer on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 - 1n;
          const nonce = 1;
          await expect(
            asset.methods.transfer_public(accounts[0].address, accounts[1].address, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: invalid nonce');
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
          ).rejects.toThrowError('Assertion failed: Message not authorized by account');
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
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

          // We need to compute the message we want to sign and add it to the wallet as approved
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          // Perform the transfer
          await expect(action.simulate()).rejects.toThrowError('Assertion failed: Underflow');

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
          const messageHash = computeAuthWitMessageHash(accounts[0].address, action.request());

          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          // Perform the transfer
          await expect(action.simulate()).rejects.toThrowError('Assertion failed: Message not authorized by account');

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
          const messageHash = computeAuthWitMessageHash(accounts[0].address, action.request());
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          // Perform the transfer
          await expect(action.simulate()).rejects.toThrowError('Assertion failed: Message not authorized by account');

          expect(await asset.methods.balance_of_public(accounts[0].address).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_public(accounts[1].address).view()).toEqual(balance1);
        });
      });
    });

    describe('private', () => {
      it('transfer less than balance', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods.transfer(accounts[0].address, accounts[1].address, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);
      });

      it('transfer to self', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods.transfer(accounts[0].address, accounts[0].address, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
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
        const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
        // docs:end:authwit_computeAuthWitMessageHash

        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[1].addAuthWitness(witness);
        // docs:end:authwit_transfer_example

        // Perform the transfer
        const tx = action.send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);

        // Perform the transfer again, should fail
        const txReplay = asset
          .withWallet(wallets[1])
          .methods.transfer(accounts[0].address, accounts[1].address, amount, nonce)
          .send();
        await expect(txReplay.wait()).rejects.toThrowError('Transaction ');
      });

      describe('failure cases', () => {
        it('transfer more than balance', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(
            asset.methods.transfer(accounts[0].address, accounts[1].address, amount, 0).simulate(),
          ).rejects.toThrowError('Assertion failed: Balance too low');
        });

        it('transfer on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(
            asset.methods.transfer(accounts[0].address, accounts[1].address, amount, 1).simulate(),
          ).rejects.toThrowError('Assertion failed: invalid nonce');
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
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

          // Both wallets are connected to same node and PXE so we could just insert directly using
          // await wallet.signAndAddAuthWitness(messageHash, );
          // But doing it in two actions to show the flow.
          const witness = await wallets[0].createAuthWitness(messageHash);
          await wallets[1].addAuthWitness(witness);

          // Perform the transfer
          await expect(action.simulate()).rejects.toThrowError('Assertion failed: Balance too low');
          expect(await asset.methods.balance_of_private(accounts[0].address).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_private(accounts[1].address).view()).toEqual(balance1);
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

          await expect(action.simulate()).rejects.toThrowError(
            `Unknown auth witness for message hash 0x${messageHash.toString('hex')}`,
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
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
          const expectedMessageHash = computeAuthWitMessageHash(accounts[2].address, action.request());

          const witness = await wallets[0].createAuthWitness(messageHash);
          await wallets[2].addAuthWitness(witness);

          await expect(action.simulate()).rejects.toThrowError(
            `Unknown auth witness for message hash 0x${expectedMessageHash.toString('hex')}`,
          );
          expect(await asset.methods.balance_of_private(accounts[0].address).view()).toEqual(balance0);
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

      const tx = asset.methods.shield(accounts[0].address, amount, secretHash, 0).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      tokenSim.shield(accounts[0].address, amount);
      await tokenSim.check();

      // Redeem it
      await addPendingShieldNoteToPXE(0, amount, secretHash, receipt.txHash);
      const txClaim = asset.methods.redeem_shield(accounts[0].address, amount, secret).send();
      const receiptClaim = await txClaim.wait();
      expect(receiptClaim.status).toBe(TxStatus.MINED);

      tokenSim.redeemShield(accounts[0].address, amount);
    });

    it('on behalf of other', async () => {
      const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
      const amount = balancePub / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const action = asset.withWallet(wallets[1]).methods.shield(accounts[0].address, amount, secretHash, nonce);
      const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
      await wallets[0].setPublicAuth(messageHash, true).send().wait();

      const tx = action.send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      tokenSim.shield(accounts[0].address, amount);
      await tokenSim.check();

      // Check that replaying the shield should fail!
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.shield(accounts[0].address, amount, secretHash, nonce)
        .send();
      await expect(txReplay.wait()).rejects.toThrowError('Transaction ');

      // Redeem it
      await addPendingShieldNoteToPXE(0, amount, secretHash, receipt.txHash);
      const txClaim = asset.methods.redeem_shield(accounts[0].address, amount, secret).send();
      const receiptClaim = await txClaim.wait();
      expect(receiptClaim.status).toBe(TxStatus.MINED);

      tokenSim.redeemShield(accounts[0].address, amount);
    });

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balancePub + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(asset.methods.shield(accounts[0].address, amount, secretHash, 0).simulate()).rejects.toThrowError(
          'Assertion failed: Underflow',
        );
      });

      it('on behalf of self (invalid nonce)', async () => {
        const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balancePub + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(asset.methods.shield(accounts[0].address, amount, secretHash, 1).simulate()).rejects.toThrowError(
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
        const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
        await wallets[0].setPublicAuth(messageHash, true).send().wait();

        await expect(action.simulate()).rejects.toThrowError('Assertion failed: Underflow');
      });

      it('on behalf of other (wrong designated caller)', async () => {
        const balancePub = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balancePub + 1n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[2]).methods.shield(accounts[0].address, amount, secretHash, nonce);
        const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
        await wallets[0].setPublicAuth(messageHash, true).send().wait();

        await expect(action.simulate()).rejects.toThrowError('Assertion failed: Message not authorized by account');
      });

      it('on behalf of other (without approval)', async () => {
        const balance = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.withWallet(wallets[1]).methods.shield(accounts[0].address, amount, secretHash, nonce).simulate(),
        ).rejects.toThrowError(`Assertion failed: Message not authorized by account`);
      });
    });
  });

  describe('Unshielding', () => {
    it('on behalf of self', async () => {
      const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
      const amount = balancePriv / 2n;
      expect(amount).toBeGreaterThan(0n);

      const tx = asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 0).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

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
      const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

      // Both wallets are connected to same node and PXE so we could just insert directly using
      // await wallet.signAndAddAuthWitness(messageHash, );
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWitness(messageHash);
      await wallets[1].addAuthWitness(witness);

      const tx = action.send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      tokenSim.unshield(accounts[0].address, accounts[1].address, amount);

      // Perform the transfer again, should fail
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.unshield(accounts[0].address, accounts[1].address, amount, nonce)
        .send();
      await expect(txReplay.wait()).rejects.toThrowError('Transaction ');
    });

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 0).simulate(),
        ).rejects.toThrowError('Assertion failed: Balance too low');
      });

      it('on behalf of self (invalid nonce)', async () => {
        const balancePriv = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.unshield(accounts[0].address, accounts[0].address, amount, 1).simulate(),
        ).rejects.toThrowError('Assertion failed: invalid nonce');
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
        const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

        // Both wallets are connected to same node and PXE so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, );
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[1].addAuthWitness(witness);

        await expect(action.simulate()).rejects.toThrowError('Assertion failed: Balance too low');
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

        // Both wallets are connected to same node and PXE so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, );
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[2].addAuthWitness(witness);

        await expect(action.simulate()).rejects.toThrowError(
          `Unknown auth witness for message hash 0x${expectedMessageHash.toString('hex')}`,
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
        const tx = asset.methods.burn_public(accounts[0].address, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.burnPublic(accounts[0].address, amount);
      });

      it('burn on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const nonce = Fr.random();

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce);
        const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
        await wallets[0].setPublicAuth(messageHash, true).send().wait();

        const tx = action.send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.burnPublic(accounts[0].address, amount);

        const burnTx = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce).send();
        // Check that the message hash is no longer valid. Need to try to send since nullifiers are handled by sequencer.
        await expect(burnTx.wait()).rejects.toThrowError('Transaction ');
      });

      describe('failure cases', () => {
        it('burn more than balance', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = 0;
          await expect(asset.methods.burn_public(accounts[0].address, amount, nonce).simulate()).rejects.toThrowError(
            'Assertion failed: Underflow',
          );
        });

        it('burn on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          const nonce = 1;
          await expect(asset.methods.burn_public(accounts[0].address, amount, nonce).simulate()).rejects.toThrowError(
            'Assertion failed: invalid nonce',
          );
        });

        it('burn on behalf of other without "approval"', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          await expect(
            asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: Message not authorized by account');
        });

        it('burn more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce);
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          await expect(action.simulate()).rejects.toThrowError('Assertion failed: Underflow');
        });

        it('burn on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_public(accounts[0].address).view();
          const amount = balance0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce);
          const messageHash = computeAuthWitMessageHash(accounts[0].address, action.request());
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          await expect(
            asset.withWallet(wallets[1]).methods.burn_public(accounts[0].address, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: Message not authorized by account');
        });
      });
    });

    describe('private', () => {
      it('burn less than balance', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods.burn(accounts[0].address, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.burnPrivate(accounts[0].address, amount);
      });

      it('burn on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce);
        const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

        // Both wallets are connected to same node and PXE so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, );
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[1].addAuthWitness(witness);

        const tx = asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.burnPrivate(accounts[0].address, amount);

        // Perform the transfer again, should fail
        const txReplay = asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce).send();
        await expect(txReplay.wait()).rejects.toThrowError('Transaction ');
      });

      describe('failure cases', () => {
        it('burn more than balance', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(asset.methods.burn(accounts[0].address, amount, 0).simulate()).rejects.toThrowError(
            'Assertion failed: Balance too low',
          );
        });

        it('burn on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(asset.methods.burn(accounts[0].address, amount, 1).simulate()).rejects.toThrowError(
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
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

          // Both wallets are connected to same node and PXE so we could just insert directly using
          // await wallet.signAndAddAuthWitness(messageHash, );
          // But doing it in two actions to show the flow.
          const witness = await wallets[0].createAuthWitness(messageHash);
          await wallets[1].addAuthWitness(witness);

          await expect(action.simulate()).rejects.toThrowError('Assertion failed: Balance too low');
        });

        it('burn on behalf of other without approval', async () => {
          const balance0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[1]).methods.burn(accounts[0].address, amount, nonce);
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());

          await expect(action.simulate()).rejects.toThrowError(
            `Unknown auth witness for message hash 0x${messageHash.toString('hex')}`,
          );
        });

        it('on behalf of other (invalid designated caller)', async () => {
          const balancePriv0 = await asset.methods.balance_of_private(accounts[0].address).view();
          const amount = balancePriv0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const action = asset.withWallet(wallets[2]).methods.burn(accounts[0].address, amount, nonce);
          const messageHash = computeAuthWitMessageHash(accounts[1].address, action.request());
          const expectedMessageHash = computeAuthWitMessageHash(accounts[2].address, action.request());

          const witness = await wallets[0].createAuthWitness(messageHash);
          await wallets[2].addAuthWitness(witness);

          await expect(action.simulate()).rejects.toThrowError(
            `Unknown auth witness for message hash 0x${expectedMessageHash.toString('hex')}`,
          );
        });
      });
    });
  });

  describe('Attestations', () => {
    const secret = Fr.random();
    const amount = 10000n;
    const shieldId = 0n;
    let token: AztecAddress;
    let secretHash: Fr;
    let txHash: TxHash;

    let shieldIds = Array(VEC_LEN).fill(0n);
    shieldIds[0] = shieldId;

    beforeAll(async () => {
      token = asset.address;

      secretHash = computeMessageSecretHash(secret);
      const tx = asset.methods.mint_private(amount, secretHash).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      tokenSim.mintPrivate(amount);
      txHash = receipt.txHash;
      await addPendingShieldNoteToPXE(0, amount, secretHash, txHash);

      const txClaim = asset.methods.redeem_shield(accounts[0].address, amount, secret).send();
      const receiptClaim = await txClaim.wait();
      expect(receiptClaim.status).toBe(TxStatus.MINED);
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
      const proofs = await attestorSim.getSiblingPaths(accounts[0].address, shieldIds);

      const tx = asset.methods.request_attestation(accounts[0].address, attestor.address, root, proofs.flat(), 0).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      expect(await asset.methods.has_attestation(accounts[0].address, attestor.address).view()).toBe(true);
    });

    describe('Partial transfers', () => {
      let account1: AztecAddress;
      let account2: AztecAddress;
      let wallet1: Wallet;
      let wallet2: Wallet;

      beforeEach(async () => {
        asset = await TokenContract.deploy(wallets[0], accounts[0].address).send().deployed();
        logger(`Token deployed to ${asset.address}`);
        tokenSim = new TokenSimulator(
          asset,
          logger,
          accounts.map(a => a.address),
        );
        expect(await asset.methods.admin().view()).toBe(accounts[0].address.toBigInt());
        token = asset.address;

        secretHash = computeMessageSecretHash(secret);
        const tx = asset.methods.mint_private(amount, secretHash).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.mintPrivate(amount);
        txHash = receipt.txHash;
        await addPendingShieldNoteToPXE(0, amount, secretHash, txHash);

        const tx2 = asset.methods.redeem_shield(accounts[0].address, amount, secret).send();
        const receipt2 = await tx2.wait();
        expect(receipt2.status).toBe(TxStatus.MINED);
        tokenSim.redeemShield(accounts[0].address, amount);

        attestor = await AttestorContract.deploy(wallets[0], accounts[0].address).send().deployed();
        logger(`Attestor deployed to ${attestor.address}`);
        attestorSim = new AttestorSimulator();

        account1 = accounts[0].address;
        account2 = accounts[1].address;
        wallet1 = wallets[0];
        wallet2 = wallets[1];
      }, 100_000);

      it('Attestation transfer', async () => {
        let root = await attestor.methods.get_blacklist_root(token).view();
        const proofs = await attestorSim.getSiblingPaths(accounts[0].address, shieldIds);

        const tx1 = asset.withWallet(wallet1).methods.request_attestation(account1, attestor.address, root, proofs.flat(), 0).send();
        const receipt1 = await tx1.wait();
        expect(receipt1.status).toBe(TxStatus.MINED);

        expect(await asset.methods.has_attestation(account1, attestor.address).view()).toBe(true);
        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(false);

        const balance0 = await asset.methods.balance_of_private(account1).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.withWallet(wallet1).methods.transfer(account1, account2, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.transferPrivate(account1, account2, amount);
      
        expect(await asset.methods.has_attestation(account1, attestor.address).view()).toBe(true);
        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(true);
      });

      it('Deposit ID transfer', async () => {
        const proof1 = await attestorSim.getSiblingPath(token, shieldId);
        expect(await attestor.methods.is_not_blacklisted(token, shieldId, proof1).view()).toEqual(true);

        const tx1 = attestor.methods.add_to_blacklist(token, shieldId, proof1).send();
        const receipt1 = await tx1.wait();
        expect(receipt1.status).toBe(TxStatus.MINED);
        await attestorSim.addToBlacklist(token, shieldId);

        const root2 = await attestorSim.getRoot(token);
        const proof2 = await attestorSim.getSiblingPath(token, shieldId);
        expect(await attestor.methods.is_not_blacklisted(token, shieldId, proof2).view()).toEqual(false);

        const balance0 = await asset.methods.balance_of_private(account1).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.withWallet(wallet1).methods.transfer(account1, account2, amount, 0).send();
        const receipt2 = await tx.wait();
        expect(receipt2.status).toBe(TxStatus.MINED);
        tokenSim.transferPrivate(account1, account2, amount);
        
        // const tx4 = asset.withWallet(wallet1).methods.request_attestation(account1, attestor.address, root2, proof2, 0).send();

        // Request attestation should fail i.e. not add any attestation
        const proofs = await attestorSim.getSiblingPaths(account1, shieldIds);
        const tx3 = asset.withWallet(wallet2).methods.request_attestation(account2, attestor.address, root2, proofs.flat(), 0).send();
        const receipt3 = await tx3.wait();
        expect(receipt3.status).toBe(TxStatus.MINED);

        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(false);
      });
    });

    describe('Full transfers', () => {
      let account1: AztecAddress;
      let account2: AztecAddress;
      let wallet1: Wallet;
      let wallet2: Wallet;

      beforeEach(async () => {
        asset = await TokenContract.deploy(wallets[0], accounts[0].address).send().deployed();
        logger(`Token deployed to ${asset.address}`);
        tokenSim = new TokenSimulator(
          asset,
          logger,
          accounts.map(a => a.address),
        );
        expect(await asset.methods.admin().view()).toBe(accounts[0].address.toBigInt());
        token = asset.address;

        secretHash = computeMessageSecretHash(secret);
        const tx = asset.methods.mint_private(amount, secretHash).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.mintPrivate(amount);
        txHash = receipt.txHash;
        await addPendingShieldNoteToPXE(0, amount, secretHash, txHash);

        const tx2 = asset.methods.redeem_shield(accounts[0].address, amount, secret).send();
        const receipt2 = await tx2.wait();
        expect(receipt2.status).toBe(TxStatus.MINED);
        tokenSim.redeemShield(accounts[0].address, amount);

        attestor = await AttestorContract.deploy(wallets[0], accounts[0].address).send().deployed();
        logger(`Attestor deployed to ${attestor.address}`);
        attestorSim = new AttestorSimulator();

        account1 = accounts[0].address;
        account2 = accounts[1].address;
        wallet1 = wallets[0];
        wallet2 = wallets[1];
      }, 100_000);

      it('Attestation transfer', async () => {
        let root = await attestor.methods.get_blacklist_root(token).view();
        const proofs = await attestorSim.getSiblingPaths(token, shieldIds);

        const tx1 = asset.withWallet(wallet1).methods.request_attestation(account1, attestor.address, root, proofs.flat(), 0).send();
        const receipt1 = await tx1.wait();
        expect(receipt1.status).toBe(TxStatus.MINED);

        expect(await asset.methods.has_attestation(account1, attestor.address).view()).toBe(true);
        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(false);

        const balance0 = await asset.methods.balance_of_private(account1).view();
        const amount = balance0;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.withWallet(wallet1).methods.transfer(account1, account2, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.transferPrivate(account1, account2, amount);
      
        expect(await asset.methods.has_attestation(account1, attestor.address).view()).toBe(false);
        expect(await asset.methods.has_attestation(account2, attestor.address).view()).toBe(true);
      });
    });
  });
});
