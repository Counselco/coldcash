import type { Hex, Address } from "@coldcash/shared";
import { encodeAbiParameters, keccak256, type PrivateKeyAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface AttestationData {
  chainId: number;
  escrow: Address;
  payoutBps: number;
  evidenceHash: Hex;
}

export interface AttestationSignature {
  v: number;
  r: Hex;
  s: Hex;
}

export class AttestorSigner {
  private account: PrivateKeyAccount;

  constructor() {
    const key = process.env.COLDCASH_ATTESTOR_KEY;
    if (!key) {
      throw new Error(
        "COLDCASH_ATTESTOR_KEY environment variable is required. " +
        "The production attestation key is a human act, never this service's. " +
        "Set the key in your environment before running the oracle service."
      );
    }

    this.account = privateKeyToAccount(key as Hex);
  }

  get address(): Address {
    return this.account.address;
  }

  async sign(data: AttestationData): Promise<AttestationSignature> {
    const messageHash = keccak256(
      encodeAbiParameters(
        [
          { name: "chainId", type: "uint256" },
          { name: "escrow", type: "address" },
          { name: "payoutBps", type: "uint16" },
          { name: "evidenceHash", type: "bytes32" }
        ],
        [BigInt(data.chainId), data.escrow, data.payoutBps, data.evidenceHash]
      )
    );

    const signature = await this.account.signMessage({
      message: { raw: messageHash }
    });

    const r = signature.slice(0, 66) as Hex;
    const s = `0x${signature.slice(66, 130)}` as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    return { v, r, s };
  }
}
