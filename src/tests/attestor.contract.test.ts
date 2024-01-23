import { AttestorContract } from '../artifacts/Attestor.js';
import { AttestorSimulator } from './attestor_simulator.js';
import {
  AccountWallet,
  AztecAddress,
  CompleteAddress,
  DebugLogger,
  PXE,
  TxStatus,
  createDebugLogger,
} from '@aztec/aztec.js';
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { beforeAll, expect, jest } from '@jest/globals';

import { setupEnvironment } from '../environment/index.js';

const TIMEOUT = 60_000;

describe('e2e_attestor_contract', () => {
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  let attestor: AttestorContract;

  let attestorSim: AttestorSimulator;
  let pxe: PXE;
  
  let admin: AztecAddress;
  let token: AztecAddress;

  beforeAll(async () => {
    logger = createDebugLogger('box:attestor_contract_test');
    pxe = await setupEnvironment();
    // wallets = await createAccounts(pxe, 3);
    accounts = await pxe.getRegisteredAccounts();
    wallets = await getInitialTestAccountsWallets(pxe);
    
    logger(`Accounts: ${accounts.map(a => a.toReadableString())}`);
    logger(`Wallets: ${wallets.map(w => w.getAddress().toString())}`);

    admin = accounts[0].address;
    token = accounts[1].address;

    attestor = await AttestorContract.deploy(wallets[0], admin).send().deployed();
    logger(`Attestor deployed to ${attestor.address}`);
    attestorSim = new AttestorSimulator();

    expect(await attestor.methods.admin().view()).toBe(admin.toBigInt());

    // console.log("empty root", await attestorSim.getRoot(token));
  }, 100_000);

  // afterEach(async () => {
  //   await attestorSim.check();
  // }, TIMEOUT);

  // describe("Access controlled functions", () => {
  //   it("Set admin", async () => {
  //     const tx = attestor.methods.set_admin(accounts[1].address).send();
  //     const receipt = await tx.wait();
  //     expect(receipt.status).toBe(TxStatus.MINED);
  //     expect(await attestor.methods.admin().view()).toBe(
  //       accounts[1].address.toBigInt()
  //     );
  //   });

  //   describe("failure cases", () => {
  //     it("Set admin (not admin)", async () => {
  //       await expect(
  //         attestor.methods.set_admin(admin).simulate()
  //       ).rejects.toThrowError("Assertion failed: caller is not admin");
  //     });
  //   });
  // });

  describe('Blacklisting', () => {
    it('single', async () => {
      const shieldId = 0n;

      expect(await attestor.methods.get_blacklist_root(token).view()).toEqual(await attestorSim.getRoot(token));

      const proof = await attestorSim.getSiblingPath(token, shieldId);
      expect(await attestor.methods.is_not_blacklisted(token, shieldId, proof).view()).toEqual(true);

      const tx = attestor.methods.add_to_blacklist(token, shieldId, proof).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      await attestorSim.addToBlacklist(token, shieldId);

      expect(await attestor.methods.get_blacklist_root(token).view()).toEqual(await attestorSim.getRoot(token));
      expect(await attestor.methods.is_not_blacklisted(token, shieldId, proof).view()).toEqual(false);
    });

    it('multiple', async () => {
      const shieldIds = [1n, 69n, 420n];

      for (const shieldId of shieldIds) {
        const proof = await attestorSim.getSiblingPath(token, shieldId);
        expect(await attestor.methods.is_not_blacklisted(token, shieldId, proof).view()).toEqual(true);

        const tx = attestor.methods.add_to_blacklist(token, shieldId, proof).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        await attestorSim.addToBlacklist(token, shieldId);

        expect(await attestor.methods.is_not_blacklisted(token, shieldId, proof).view()).toEqual(false);
      }
    });

    describe('failure cases', () => {
      it('as non-admin', async () => {
        const shieldId = 69n;
        const proof = await attestorSim.getSiblingPath(token, shieldId);
        await expect(
          attestor.withWallet(wallets[1]).methods.add_to_blacklist(token, shieldId, proof).simulate(),
        ).rejects.toThrowError('caller is not admin');
      });
    });
  });

  // describe("Requesting attestation", () => {
  //   const shieldIds = [1n, 69n, 420n];

  //   beforeAll(async () => {
  //     for (const shieldId of shieldIds) {
  //       const tx = attestor.methods
  //         .add_to_blacklist(token, shieldId)
  //         .send();
  //       const receipt = await tx.wait();
  //       expect(receipt.status).toBe(TxStatus.MINED);
  //     }
  //   });

  //   it("single", async () => {
  //     const partitionTable = [2n, 69n];
  //     const tx = attestor.methods
  //       // BUG: Doesn't work
  //       .request_attestation(token, partitionTable)
  //       .send();
  //     const receipt = await tx.wait();
  //     expect(receipt.status).toBe(TxStatus.MINED);
  //   });
  // });
});
