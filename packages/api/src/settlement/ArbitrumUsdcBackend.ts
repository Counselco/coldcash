import type { SettlementBackend, PromiseParams, PromiseRef, PromiseState, TxRef, Address, Hex } from "@coldcash/shared";
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  parseAbi,
  encodeAbiParameters,
  keccak256,
  type Hash
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PromiseFactoryAbi, PromiseEscrowAbi, NamedAttestorAdapterAbi, MockUsdcAbi } from "./contract-abis.js";

export interface ArbitrumUsdcConfig {
  rpcUrl: string;
  chainId: number;
  factoryAddress: Address;
  usdcAddress: Address;
  oracleAddress: Address;
  signerPrivateKey?: Hex;
}

export class ArbitrumUsdcBackend implements SettlementBackend {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private config: ArbitrumUsdcConfig;

  constructor(config: ArbitrumUsdcConfig) {
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

    if (config.signerPrivateKey) {
      const account = privateKeyToAccount(config.signerPrivateKey);
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
  }

  async createPromise(params: PromiseParams): Promise<PromiseRef> {
    if (!this.walletClient) {
      throw new Error("Wallet client required for createPromise");
    }

    const { backer, prize, acceptBy, deadline, standardHash, isPublic } = params;
    const namedSeeker = params.namedSeeker || (isPublic ? "0x0000000000000000000000000000000000000000" as Address : backer);

    const totalCost = isPublic ? prize + (prize * 3n / 100n) : prize;

    const approveHash = await this.walletClient.writeContract({
      address: this.config.usdcAddress,
      abi: MockUsdcAbi,
      functionName: "approve",
      args: [this.config.factoryAddress, totalCost],
      account: this.walletClient.account!,
      chain: null
    });

    await this.publicClient.waitForTransactionReceipt({ hash: approveHash });

    const hash = await this.walletClient.writeContract({
      address: this.config.factoryAddress,
      abi: PromiseFactoryAbi,
      functionName: "createPromise",
      args: [
        prize,
        BigInt(acceptBy),
        BigInt(deadline),
        standardHash,
        namedSeeker,
        "0x0000000000000000000000000000000000000000" as Address
      ],
      account: this.walletClient.account!,
      chain: null
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    const escrowAddress = receipt.logs.find(log => log.topics[0] === "0x67840b567aa2889e86847c568d9bef7fc400b288d47cb49958a7c7823e09d596");

    if (!escrowAddress || !escrowAddress.topics[1]) {
      throw new Error("Failed to extract escrow address from PromiseCreated event");
    }

    const escrowAddr = `0x${escrowAddress.topics[1].slice(26)}` as Address;

    return {
      chainId: this.config.chainId,
      address: escrowAddr
    };
  }

  async cancel(ref: PromiseRef): Promise<TxRef> {
    if (!this.walletClient) {
      throw new Error("Wallet client required for cancel");
    }

    const hash = await this.walletClient.writeContract({
      address: ref.address,
      abi: PromiseEscrowAbi,
      functionName: "cancel",
      account: this.walletClient.account!,
      chain: null
    });

    await this.publicClient.waitForTransactionReceipt({ hash });

    return {
      chainId: ref.chainId,
      hash: hash as Hex
    };
  }

  async accept(ref: PromiseRef, seeker: Address): Promise<TxRef> {
    if (!this.walletClient) {
      throw new Error("Wallet client required for accept");
    }

    const hash = await this.walletClient.writeContract({
      address: ref.address,
      abi: PromiseEscrowAbi,
      functionName: "accept",
      account: this.walletClient.account!,
      chain: null
    });

    await this.publicClient.waitForTransactionReceipt({ hash });

    return {
      chainId: ref.chainId,
      hash: hash as Hex
    };
  }

  async resolve(ref: PromiseRef, bps: number, evidenceHash: Hex): Promise<TxRef> {
    if (!this.walletClient) {
      throw new Error("Wallet client required for resolve");
    }

    const messageHash = keccak256(
      encodeAbiParameters(
        [
          { name: "chainId", type: "uint256" },
          { name: "escrow", type: "address" },
          { name: "payoutBps", type: "uint16" },
          { name: "evidenceHash", type: "bytes32" }
        ],
        [BigInt(ref.chainId), ref.address, bps, evidenceHash]
      )
    );

    const signature = await this.walletClient.signMessage({
      message: { raw: messageHash },
      account: this.walletClient.account!
    });

    const r = signature.slice(0, 66) as Hex;
    const s = `0x${signature.slice(66, 130)}` as Hex;
    const v = parseInt(signature.slice(130, 132), 16);

    const hash = await this.walletClient.writeContract({
      address: this.config.oracleAddress,
      abi: NamedAttestorAdapterAbi,
      functionName: "relay",
      args: [ref.address, bps, evidenceHash, v, r, s],
      account: this.walletClient.account!,
      chain: null
    });

    await this.publicClient.waitForTransactionReceipt({ hash });

    return {
      chainId: ref.chainId,
      hash: hash as Hex
    };
  }

  async refund(ref: PromiseRef): Promise<TxRef> {
    if (!this.walletClient) {
      throw new Error("Wallet client required for refund");
    }

    const hash = await this.walletClient.writeContract({
      address: ref.address,
      abi: PromiseEscrowAbi,
      functionName: "refund",
      account: this.walletClient.account!,
      chain: null
    });

    await this.publicClient.waitForTransactionReceipt({ hash });

    return {
      chainId: ref.chainId,
      hash: hash as Hex
    };
  }

  async status(ref: PromiseRef): Promise<PromiseState> {
    const [state, backer, seeker, amount, acceptBy, deadline, oracle, standardHash, openOffer] = await Promise.all([
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "state"
      }),
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "backer"
      }),
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "seeker"
      }),
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "amount"
      }),
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "acceptBy"
      }),
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "deadline"
      }),
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "oracle"
      }),
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "standardHash"
      }),
      this.publicClient.readContract({
        address: ref.address,
        abi: PromiseEscrowAbi,
        functionName: "openOffer"
      })
    ]);

    const statusMap = ["Offered", "Accepted", "Paid", "Refunded", "Canceled"] as const;
    const status = statusMap[state as number];

    return {
      status,
      backer: backer as Address,
      seeker: seeker === "0x0000000000000000000000000000000000000000" ? undefined : (seeker as Address),
      prize: amount as bigint,
      acceptBy: Number(acceptBy),
      deadline: Number(deadline),
      standardHash: standardHash as Hex,
      isPublic: openOffer as boolean
    };
  }
}
