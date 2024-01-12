import { AttestorContract } from '../artifacts/Attestor.js';
import { AztecAddress, DebugLogger } from '@aztec/aztec.js';

export class AttestorSimulator {
  private blacklist: Map<AztecAddress, bigint[]> = new Map();

  constructor(protected attestor: AttestorContract, protected logger: DebugLogger, protected tokens: AztecAddress[]) {}

  public addToBlacklist(token: AztecAddress, shieldId: bigint) {
    let blacklist = this.blacklist.get(token) || [];
    this.blacklist.set(token, [...blacklist, shieldId]);
  }

  public isBlacklisted(token: AztecAddress, shieldId: bigint) {
    let blacklist = this.blacklist.get(token) || [];
    return blacklist.includes(shieldId);
  }

  // public requestAttestation(amount: bigint) {
  //   this.totalSupply += amount;
  // }

  public async check() {
    // Check that all our public matches
    for (const token of this.tokens) {
      let blacklist = this.blacklist.get(token) || [];
      for (const shieldId of blacklist) {
        expect(await this.attestor.methods.is_blacklisted({ address: token }, shieldId).view()).toEqual(true);
      }
    }
  }
}
