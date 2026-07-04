import type { Address, Hex } from "@coldcash/shared";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AttestationSignature } from "./attestor.js";

const NamedAttestorAdapterAbi = parseAbi([
  "function relay(address escrow, uint16 payoutBps, bytes32 evidenceHash, uint8 v, bytes32 r, bytes32 s) external",
  "event Attested(address indexed escrow, uint16 payoutBps, bytes32 evidenceHash, address relayer)"
]);

export interface RelayConfig {
  rpcUrl: string;
  chainId: number;
  adapterAddress: Address;
  relayerPrivateKey: Hex;
}

export class OracleRelay {
  private publicClient;
  private walletClient;
  private config: RelayConfig;

  constructor(config: RelayConfig) {
    this.config = config;

    this.publicClient = createPublicClient({
      transport: http(config.rpcUrl),
      chain: {
        id: config.chainId,
        name: "custom",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [config.rpcUrl] }, public: { http: [config.rpcUrl] } }
      }
    });

    const account = privateKeyToAccount(config.relayerPrivateKey);
    this.walletClient = createWalletClient({
      account,
      transport: http(config.rpcUrl),
      chain: {
        id: config.chainId,
        name: "custom",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [config.rpcUrl] }, public: { http: [config.rpcUrl] } }
      }
    });
  }

  async relay(
    escrow: Address,
    payoutBps: number,
    evidenceHash: Hex,
    signature: AttestationSignature
  ): Promise<Hex> {
    const hash = await this.walletClient.writeContract({
      address: this.config.adapterAddress,
      abi: NamedAttestorAdapterAbi,
      functionName: "relay",
      args: [escrow, payoutBps, evidenceHash, signature.v, signature.r, signature.s],
      account: this.walletClient.account!,
      chain: null
    });

    await this.publicClient.waitForTransactionReceipt({ hash });

    return hash;
  }
}
