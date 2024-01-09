import { AttestorContract } from "../artifacts/Attestor.js";
import { AttestorSimulator } from "./attestor_simulator.js";
import {
  AccountWallet,
  PXE,
  TxStatus,
  createPXEClient,
  getSandboxAccountsWallets,
  waitForSandbox,
} from "@aztec/aztec.js";
import { CompleteAddress } from "@aztec/circuits.js";
import { DebugLogger, createDebugLogger } from "@aztec/foundation/log";
import { beforeAll, expect, jest } from "@jest/globals";

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

  let attestor: AttestorContract;

  let attestorSim: AttestorSimulator;
  let pxe: PXE;

  beforeAll(async () => {
    logger = createDebugLogger("box:attestor_contract_test");
    pxe = await setupSandbox();
    // wallets = await createAccounts(pxe, 3);
    accounts = await pxe.getRegisteredAccounts();
    wallets = await getSandboxAccountsWallets(pxe);

    logger(`Accounts: ${accounts.map((a) => a.toReadableString())}`);
    logger(`Wallets: ${wallets.map((w) => w.getAddress().toString())}`);

    attestor = await AttestorContract.deploy(wallets[0], accounts[0].address)
      .send()
      .deployed();
    logger(`Attestor deployed to ${attestor.address}`);
    attestorSim = new AttestorSimulator(
      attestor,
      logger,
      accounts.map((a) => a.address),
    );

    expect(await attestor.methods.admin().view()).toBe(
      accounts[0].address.toBigInt()
    );
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
  //         attestor.methods.set_admin(accounts[0].address).simulate()
  //       ).rejects.toThrowError("Assertion failed: caller is not admin");
  //     });
  //   });
  // });

  describe("Blacklisting", () => {
    it("single", async () => {
      const shieldId = 69n;
      const tx = attestor.methods
        .add_to_blacklist(accounts[0].address, shieldId)
        .send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      expect(
        await attestor.methods.is_blacklisted(accounts[0].address, shieldId).view()
      ).toEqual(true);
    });

    it("multiple", async () => {
      const shieldIds = [1n, 69n, 420n];

      for (const shieldId of shieldIds) {
        const tx = attestor.methods
          .add_to_blacklist(accounts[0].address, shieldId)
          .send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        expect(
          await attestor.methods.is_blacklisted(accounts[0].address, shieldId).view()
        ).toEqual(true);
      }
    });

    describe("failure cases", () => {
      it("as non-admin", async () => {
      const shieldId = 69n;
        await expect(
          attestor
            .withWallet(wallets[1])
            .methods.add_to_blacklist(accounts[0].address, shieldId)
            .simulate()
        ).rejects.toThrowError("caller is not admin");
      });
    });
  });
  
  // describe("Requesting attestation", () => {
  //   const shieldIds = [1n, 69n, 420n];

  //   beforeAll(async () => {
  //     for (const shieldId of shieldIds) {
  //       const tx = attestor.methods
  //         .add_to_blacklist(accounts[0].address, shieldId)
  //         .send();
  //       const receipt = await tx.wait();
  //       expect(receipt.status).toBe(TxStatus.MINED);
  //     }
  //   });

  //   it("single", async () => {
  //     const partitionTable = [2n, 69n];
  //     const tx = attestor.methods
  //       // BUG: Doesn't work
  //       .request_attestation(accounts[0].address, partitionTable)
  //       .send();
  //     const receipt = await tx.wait();
  //     expect(receipt.status).toBe(TxStatus.MINED);
  //   });
  // });
});

