import type { Address, Hex } from "viem";
import { createWalletClient, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * DemoWalletProvider: uses anvil dev accounts for local testing.
 * NO Privy integration (Privy slots in later, no keys exist for v1).
 */

export interface WalletProvider {
  getAddress(): Promise<Address>;
  getClient(): Promise<WalletClient>;
  signMessage(message: string): Promise<Hex>;
}

export const DEMO_ACCOUNTS = [
  { key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  { key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
  { key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
];

export class DemoWalletProvider implements WalletProvider {
  private account: ReturnType<typeof privateKeyToAccount>;
  private rpcUrl: string;
  private chainId: number;

  constructor(accountIndex: number = 0, rpcUrl: string = "http://127.0.0.1:8545", chainId: number = 31337) {
    if (accountIndex >= DEMO_ACCOUNTS.length) {
      throw new Error(`Demo account index ${accountIndex} out of range`);
    }
    this.account = privateKeyToAccount(DEMO_ACCOUNTS[accountIndex].key as Hex);
    this.rpcUrl = rpcUrl;
    this.chainId = chainId;
  }

  async getAddress(): Promise<Address> {
    return this.account.address;
  }

  async getClient(): Promise<WalletClient> {
    return createWalletClient({
      account: this.account,
      transport: http(this.rpcUrl),
      chain: {
        id: this.chainId,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [this.rpcUrl] }, public: { http: [this.rpcUrl] } },
      },
    });
  }

  async signMessage(message: string): Promise<Hex> {
    return await this.account.signMessage({ message });
  }
}
