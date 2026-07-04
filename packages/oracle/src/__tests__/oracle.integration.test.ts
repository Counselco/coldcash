import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  getAddress,
  parseAbi
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AttestorSigner } from "../attestor.js";
import { GitHubMergeAdapter, type WebhookEvent, type GitHubMergeStandard } from "../adapters/github-merge.js";
import { OracleRelay } from "../relay.js";

import promiseFactoryArtifact from "../../../contracts/out/PromiseFactory.sol/PromiseFactory.json" with { type: "json" };
import promiseEscrowArtifact from "../../../contracts/out/PromiseEscrow.sol/PromiseEscrow.json" with { type: "json" };
import namedAttestorAdapterArtifact from "../../../contracts/out/NamedAttestorAdapter.sol/NamedAttestorAdapter.json" with { type: "json" };
import mockUsdcArtifact from "../../../contracts/out/PromiseEscrow.t.sol/MockUSDC.json" with { type: "json" };

const ANVIL_RPC = "http://127.0.0.1:8545";
const CHAIN_ID = 31337;

const ANVIL_ACCOUNTS = [
  { key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  { key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
  { key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
  { key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
  { key: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" }
];

const MockUsdcAbi = mockUsdcArtifact.abi;
const PromiseFactoryAbi = promiseFactoryArtifact.abi;
const PromiseEscrowAbi = promiseEscrowArtifact.abi;
const NamedAttestorAdapterAbi = namedAttestorAdapterArtifact.abi;

const WEBHOOK_SECRET = "test_secret_key_for_signature_validation";

describe("Oracle Integration Tests", () => {
  let anvilProcess: ChildProcess;
  let usdcAddress: Address;
  let factoryAddress: Address;
  let adapterAddress: Address;
  let escrowAddress: Address;
  let attestorKey: Hex;
  let attestorAddress: Address;

  beforeAll(async () => {
    attestorKey = ANVIL_ACCOUNTS[4].key as Hex;
    attestorAddress = getAddress(ANVIL_ACCOUNTS[4].address);
    process.env.COLDCASH_ATTESTOR_KEY = attestorKey;

    anvilProcess = spawn(process.env.HOME + "/.foundry/bin/anvil", [], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const publicClient = createPublicClient({
      transport: http(ANVIL_RPC),
      chain: {
        id: CHAIN_ID,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
      }
    });

    const deployer = privateKeyToAccount(ANVIL_ACCOUNTS[0].key as Hex);
    const deployerClient = createWalletClient({
      account: deployer,
      transport: http(ANVIL_RPC),
      chain: {
        id: CHAIN_ID,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
      }
    });

    const usdcHash = await deployerClient.deployContract({
      abi: MockUsdcAbi,
      bytecode: mockUsdcArtifact.bytecode.object as Hex,
      account: deployer
    });

    const usdcReceipt = await publicClient.waitForTransactionReceipt({ hash: usdcHash });
    usdcAddress = usdcReceipt.contractAddress!;

    const feeRecipient = ANVIL_ACCOUNTS[3].address as Address;

    const adapterHash = await deployerClient.deployContract({
      abi: NamedAttestorAdapterAbi,
      bytecode: namedAttestorAdapterArtifact.bytecode.object as Hex,
      args: [attestorAddress],
      account: deployer
    });

    const adapterReceipt = await publicClient.waitForTransactionReceipt({ hash: adapterHash });
    adapterAddress = adapterReceipt.contractAddress!;

    const factoryHash = await deployerClient.deployContract({
      abi: PromiseFactoryAbi,
      bytecode: promiseFactoryArtifact.bytecode.object as Hex,
      args: [usdcAddress, feeRecipient, adapterAddress],
      account: deployer
    });

    const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryHash });
    factoryAddress = factoryReceipt.contractAddress!;

    const backer = ANVIL_ACCOUNTS[1].address as Address;
    const mintHash = await deployerClient.writeContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "mint",
      args: [backer, 1_000_000_000n],
      account: deployer
    });

    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    const backerAccount = privateKeyToAccount(ANVIL_ACCOUNTS[1].key as Hex);
    const backerClient = createWalletClient({
      account: backerAccount,
      transport: http(ANVIL_RPC),
      chain: {
        id: CHAIN_ID,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
      }
    });

    const approveHash = await backerClient.writeContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "approve",
      args: [factoryAddress, 100_000_000n],
      account: backerAccount,
      chain: null
    });

    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    const seeker = getAddress(ANVIL_ACCOUNTS[2].address);
    const standardHash = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

    const createHash = await backerClient.writeContract({
      address: factoryAddress,
      abi: PromiseFactoryAbi,
      functionName: "createPromise",
      args: [
        100_000_000n,
        BigInt(Math.floor(Date.now() / 1000) + 86400),
        BigInt(Math.floor(Date.now() / 1000) + 604800),
        standardHash,
        seeker,
        "0x0000000000000000000000000000000000000000" as Address
      ],
      account: backerAccount,
      chain: null
    });

    const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

    const escrowLog = createReceipt.logs.find(log => log.topics[0] === "0x67840b567aa2889e86847c568d9bef7fc400b288d47cb49958a7c7823e09d596");
    if (!escrowLog || !escrowLog.topics[1]) {
      throw new Error("Failed to extract escrow address");
    }

    escrowAddress = `0x${escrowLog.topics[1].slice(26)}` as Address;

    const seekerAccount = privateKeyToAccount(ANVIL_ACCOUNTS[2].key as Hex);
    const seekerClient = createWalletClient({
      account: seekerAccount,
      transport: http(ANVIL_RPC),
      chain: {
        id: CHAIN_ID,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
      }
    });

    const acceptHash = await seekerClient.writeContract({
      address: escrowAddress,
      abi: parseAbi(["function accept() external"]),
      functionName: "accept",
      account: seekerAccount,
      chain: null
    });

    await publicClient.waitForTransactionReceipt({ hash: acceptHash });
  }, 30000);

  afterAll(() => {
    if (anvilProcess) {
      anvilProcess.kill();
    }
    delete process.env.COLDCASH_ATTESTOR_KEY;
  });

  it("(a) happy path: merged PR webhook → adapter evaluates → attestor signs → relay → Paid", async () => {
    const standard: GitHubMergeStandard = {
      kind: "github-merge",
      repo: "testorg/testrepo",
      prNumber: 42,
      deadline: Math.floor(Date.now() / 1000) + 86400
    };

    const mergedAt = new Date(Date.now() - 3600000).toISOString();

    const webhookEvent: WebhookEvent = {
      action: "closed",
      pull_request: {
        number: 42,
        merged: true,
        merged_at: mergedAt,
        merge_commit_sha: "abc123def456",
        head: {
          ref: "feature-branch"
        },
        base: {
          repo: {
            full_name: "testorg/testrepo"
          }
        }
      },
      repository: {
        full_name: "testorg/testrepo"
      }
    };

    const crypto = require("crypto");
    const payload = JSON.stringify(webhookEvent);
    const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
    const signature = "sha256=" + hmac.update(payload).digest("hex");

    const adapter = new GitHubMergeAdapter();
    const evidence = await adapter.ingestWebhook(webhookEvent, signature, WEBHOOK_SECRET);

    expect(evidence).toBeTruthy();
    expect(evidence!.repo).toBe("testorg/testrepo");
    expect(evidence!.prNumber).toBe(42);
    expect(evidence!.mergeCommitSha).toBe("abc123def456");

    const result = await adapter.evaluateWithStandard(standard, evidence!);

    expect(result).not.toBe("pending");
    if (result !== "pending") {
      expect(result.bps).toBe(10_000);

      const signer = new AttestorSigner();
      const sig = await signer.sign({
        chainId: CHAIN_ID,
        escrow: escrowAddress,
        payoutBps: result.bps,
        evidenceHash: result.evidenceHash
      });

      const relay = new OracleRelay({
        rpcUrl: ANVIL_RPC,
        chainId: CHAIN_ID,
        adapterAddress,
        relayerPrivateKey: ANVIL_ACCOUNTS[0].key as Hex
      });

      await relay.relay(escrowAddress, result.bps, result.evidenceHash, sig);

      const publicClient = createPublicClient({
        transport: http(ANVIL_RPC),
        chain: {
          id: CHAIN_ID,
          name: "anvil",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
        }
      });

      const state = await publicClient.readContract({
        address: escrowAddress,
        abi: PromiseEscrowAbi,
        functionName: "state"
      });

      const seeker = getAddress(ANVIL_ACCOUNTS[2].address);
      const seekerBalance = await publicClient.readContract({
        address: usdcAddress,
        abi: MockUsdcAbi,
        functionName: "balanceOf",
        args: [seeker]
      });

      expect(state).toBe(2);
      expect(seekerBalance).toBe(100_000_000n);
    }
  }, 30000);

  it("(b) unmerged PR → pending", async () => {
    const standard: GitHubMergeStandard = {
      kind: "github-merge",
      repo: "testorg/testrepo",
      prNumber: 99,
      deadline: Math.floor(Date.now() / 1000) + 86400
    };

    const webhookEvent: WebhookEvent = {
      action: "closed",
      pull_request: {
        number: 99,
        merged: false,
        merged_at: null,
        merge_commit_sha: null,
        head: {
          ref: "feature-branch"
        },
        base: {
          repo: {
            full_name: "testorg/testrepo"
          }
        }
      },
      repository: {
        full_name: "testorg/testrepo"
      }
    };

    const crypto = require("crypto");
    const payload = JSON.stringify(webhookEvent);
    const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
    const signature = "sha256=" + hmac.update(payload).digest("hex");

    const adapter = new GitHubMergeAdapter();
    const evidence = await adapter.ingestWebhook(webhookEvent, signature, WEBHOOK_SECRET);

    expect(evidence).toBeNull();
  });

  it("(c) invalid webhook signature → rejected", async () => {
    const webhookEvent: WebhookEvent = {
      action: "closed",
      pull_request: {
        number: 42,
        merged: true,
        merged_at: new Date().toISOString(),
        merge_commit_sha: "abc123def456",
        head: {
          ref: "feature-branch"
        },
        base: {
          repo: {
            full_name: "testorg/testrepo"
          }
        }
      },
      repository: {
        full_name: "testorg/testrepo"
      }
    };

    const invalidSignature = "sha256=0000000000000000000000000000000000000000000000000000000000000000";

    const adapter = new GitHubMergeAdapter();

    await expect(
      adapter.ingestWebhook(webhookEvent, invalidSignature, WEBHOOK_SECRET)
    ).rejects.toThrow("Invalid webhook signature");
  });

  it("(d) merge after deadline → pending", async () => {
    const deadline = Math.floor(Date.now() / 1000) - 86400;

    const standard: GitHubMergeStandard = {
      kind: "github-merge",
      repo: "testorg/testrepo",
      prNumber: 42,
      deadline
    };

    const mergedAt = new Date(Date.now()).toISOString();

    const evidence = {
      repo: "testorg/testrepo",
      prNumber: 42,
      mergeCommitSha: "abc123def456",
      mergedAt,
      source: "webhook" as const
    };

    const adapter = new GitHubMergeAdapter();
    const result = await adapter.evaluateWithStandard(standard, evidence);

    expect(result).toBe("pending");
  });
});
