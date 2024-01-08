import { AttestorContract } from "../artifacts/Attestor.js";
import { AttestorSimulator } from "./attestor_simulator.js";
import {
  AccountWallet,
  Fr,
  Note,
  PXE,
  TxHash,
  TxStatus,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
  createPXEClient,
  getSandboxAccountsWallets,
  waitForSandbox,
} from "@aztec/aztec.js";
import { CompleteAddress } from "@aztec/circuits.js";
import { DebugLogger, createDebugLogger } from "@aztec/foundation/log";
import { ExtendedNote } from "@aztec/types";
import { afterEach, beforeAll, expect, jest } from "@jest/globals";

// assumes sandbox is running locally, which this script does not trigger
// as well as anvil.  anvil can be started with yarn test:integration
const setupSandbox = async () => {
  const { PXE_URL = "http://localhost:8080" } = process.env;
  const pxe = createPXEClient(PXE_URL);
  await waitForSandbox(pxe);
  return pxe;
};

const TIMEOUT = 60_000;

describe("e2e_attestor_contract", () => {
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  let asset: AttestorContract;

  let attestorSim: AttestorSimulator;
  let pxe: PXE;

  const addPendingShieldNoteToPXE = async (
    accountIndex: number,
    amount: bigint,
    secretHash: Fr,
    txHash: TxHash
  ) => {
    const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
    const note = new Note([new Fr(amount), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      accounts[accountIndex].address,
      asset.address,
      storageSlot,
      txHash
    );
    await wallets[accountIndex].addNote(extendedNote);
  };

  beforeAll(async () => {
    logger = createDebugLogger("box:attestor_contract_test");
    pxe = await setupSandbox();
    // wallets = await createAccounts(pxe, 3);
    accounts = await pxe.getRegisteredAccounts();
    wallets = await getSandboxAccountsWallets(pxe);

    logger(`Accounts: ${accounts.map((a) => a.toReadableString())}`);
    logger(`Wallets: ${wallets.map((w) => w.getAddress().toString())}`);

    asset = await AttestorContract.deploy(wallets[0], accounts[0].address)
      .send()
      .deployed();
    logger(`Attestor deployed to ${asset.address}`);
    attestorSim = new AttestorSimulator(
      asset,
      logger,
      accounts.map((a) => a.address),
    );

    expect(await asset.methods.admin().view()).toBe(
      accounts[0].address.toBigInt()
    );
  }, 100_000);

  // afterEach(async () => {
  //   await attestorSim.check();
  // }, TIMEOUT);

  // describe("Access controlled functions", () => {
  //   it("Set admin", async () => {
  //     const tx = asset.methods.set_admin(accounts[1].address).send();
  //     const receipt = await tx.wait();
  //     expect(receipt.status).toBe(TxStatus.MINED);
  //     expect(await asset.methods.admin().view()).toBe(
  //       accounts[1].address.toBigInt()
  //     );
  //   });

  //   describe("failure cases", () => {
  //     it("Set admin (not admin)", async () => {
  //       await expect(
  //         asset.methods.set_admin(accounts[0].address).simulate()
  //       ).rejects.toThrowError("Assertion failed: caller is not admin");
  //     });
  //   });
  // });

  describe("Blacklisting", () => {
    describe("Public", () => {
      it("as admin", async () => {
        const shieldId = 69n;
        const tx = asset.methods
          .add_to_blacklist(accounts[0].address, shieldId)
          .send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        attestorSim.addToBlacklist(accounts[0].address, shieldId);
        expect(
          await asset.methods.is_blacklisted(accounts[0].address, shieldId).view()
        ).toEqual(true);
        expect(
          await asset.methods.is_blacklisted(accounts[0].address, shieldId).view()
        ).toEqual(attestorSim.isBlacklisted(accounts[0].address, shieldId));
      });

      // describe("failure cases", () => {
      //   it("as non-admin", async () => {
      //     const amount = 10000n;
      //     await expect(
      //       asset
      //         .withWallet(wallets[1])
      //         .methods.mint_public(accounts[0].address, amount)
      //         .simulate()
      //     ).rejects.toThrowError("Assertion failed: caller is not minter");
      //   });
      // });
    });
  });
});

