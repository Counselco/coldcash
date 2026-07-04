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
import { ArbitrumUsdcBackend } from "../settlement/ArbitrumUsdcBackend.js";
import { intake } from "../routes/promises.js";
import { standardHash } from "@coldcash/shared";
import { AttestorSigner } from "@coldcash/oracle/dist/attestor.js";
import { GitHubMergeAdapter, type WebhookEvent } from "@coldcash/oracle/dist/adapters/github-merge.js";
import { OracleRelay } from "@coldcash/oracle/dist/relay.js";

import promiseFactoryArtifact from "../../../contracts/out/PromiseFactory.sol/PromiseFactory.json" with { type: "json" };
import promiseEscrowArtifact from "../../../contracts/out/PromiseEscrow.sol/PromiseEscrow.json" with { type: "json" };
import namedAttestorAdapterArtifact from "../../../contracts/out/NamedAttestorAdapter.sol/NamedAttestorAdapter.json" with { type: "json" };
import mockUsdcArtifact from "../../../contracts/out/PromiseEscrow.t.sol/MockUSDC.json" with { type: "json" };

const ANVIL_PORT = process.env.ANVIL_PORT ? parseInt(process.env.ANVIL_PORT) : 8547;
const ANVIL_RPC = `http://127.0.0.1:${ANVIL_PORT}`;
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

/**
 * GATE 0: Full-thread E2E test
 *
 * This test was originally planned for P3 but hit deployment issues during anvil setup.
 * Root cause: The original attempt used hardcoded bytecode from lifecycle.integration.test.ts
 * which caused inconsistencies. Additionally, cross-package imports (api + oracle) weren't
 * properly configured.
 *
 * Fix:
 * 1. Use forge artifacts (like oracle tests) for consistent bytecode
 * 2. Add @coldcash/oracle as devDependency to @coldcash/api
 * 3. Use dedicated ANVIL_PORT (8547) to avoid conflicts with parallel tests
 *
 * This test proves the entire stack composes correctly in a single unbroken thread.
 */
describe("Full E2E: Intake → Promise → Accept → Webhook → Oracle → Paid", () => {
  let anvilProcess: ChildProcess;
  let usdcAddress: Address;
  let factoryAddress: Address;
  let adapterAddress: Address;
  let attestorKey: Hex;
  let attestorAddress: Address;

  beforeAll(async () => {
    attestorKey = ANVIL_ACCOUNTS[4].key as Hex;
    attestorAddress = getAddress(ANVIL_ACCOUNTS[4].address);
    process.env.COLDCASH_ATTESTOR_KEY = attestorKey;

    anvilProcess = spawn(process.env.HOME + "/.foundry/bin/anvil", ["--port", ANVIL_PORT.toString()], {
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

    // Deploy MockUSDC
    const usdcHash = await deployerClient.deployContract({
      abi: MockUsdcAbi,
      bytecode: mockUsdcArtifact.bytecode.object as Hex,
      account: deployer
    });

    const usdcReceipt = await publicClient.waitForTransactionReceipt({ hash: usdcHash });
    usdcAddress = usdcReceipt.contractAddress!;

    const feeRecipient = ANVIL_ACCOUNTS[3].address as Address;

    // Deploy NamedAttestorAdapter
    const adapterHash = await deployerClient.deployContract({
      abi: NamedAttestorAdapterAbi,
      bytecode: namedAttestorAdapterArtifact.bytecode.object as Hex,
      args: [attestorAddress],
      account: deployer
    });

    const adapterReceipt = await publicClient.waitForTransactionReceipt({ hash: adapterHash });
    adapterAddress = adapterReceipt.contractAddress!;

    // Deploy PromiseFactory
    const factoryHash = await deployerClient.deployContract({
      abi: PromiseFactoryAbi,
      bytecode: promiseFactoryArtifact.bytecode.object as Hex,
      args: [usdcAddress, feeRecipient, adapterAddress],
      account: deployer
    });

    const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryHash });
    factoryAddress = factoryReceipt.contractAddress!;

    // Mint USDC to backer
    const backer = ANVIL_ACCOUNTS[1].address as Address;
    const mintHash = await deployerClient.writeContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "mint",
      args: [backer, 1_000_000_000n],
      account: deployer
    });

    await publicClient.waitForTransactionReceipt({ hash: mintHash });
  }, 30000);

  afterAll(() => {
    if (anvilProcess) {
      anvilProcess.kill();
    }
    delete process.env.COLDCASH_ATTESTOR_KEY;
  });

  it("full thread: intake → frozen standard → createPromise → accept → github-merge → evaluate → sign → relay → Paid", async () => {
    // 1. INTAKE: Produce frozen standard + standardHash
    const backer = getAddress(ANVIL_ACCOUNTS[1].address);
    const seeker = getAddress(ANVIL_ACCOUNTS[2].address);
    const deadline = Math.floor(Date.now() / 1000) + 604800;

    const intakeResult = await intake({
      wish: `merge PR #42 in testorg/testrepo by ${deadline}`,
      backerAddress: backer,
      isPublic: false,
    });

    expect(intakeResult.kind).toBe("github-merge");
    expect(intakeResult.frozen.standardHash).toMatch(/^0x[0-9a-f]{64}$/);

    // 2. CREATE PROMISE: Fund the escrow on-chain
    const backend = new ArbitrumUsdcBackend({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      factoryAddress,
      usdcAddress,
      oracleAddress: adapterAddress,
      signerPrivateKey: ANVIL_ACCOUNTS[1].key as Hex
    });

    const promiseRef = await backend.createPromise({
      backer,
      prize: 100_000_000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline,
      standardHash: intakeResult.frozen.standardHash as Hex,
      isPublic: false,
      namedSeeker: seeker
    });

    expect(promiseRef.address).toMatch(/^0x[0-9a-f]{40}$/i);

    // 3. ACCEPT: Seeker accepts the promise
    const seekerBackend = new ArbitrumUsdcBackend({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      factoryAddress,
      usdcAddress,
      oracleAddress: adapterAddress,
      signerPrivateKey: ANVIL_ACCOUNTS[2].key as Hex
    });

    await seekerBackend.accept(promiseRef, seeker);

    const stateAfterAccept = await backend.status(promiseRef);
    expect(stateAfterAccept.status).toBe("Accepted");

    // 4. GITHUB-MERGE WEBHOOK: Simulate PR merged event
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

    // 5. EVALUATE: Oracle adapter processes the webhook
    const adapter = new GitHubMergeAdapter();
    const evidence = await adapter.ingestWebhook(webhookEvent, signature, WEBHOOK_SECRET);

    expect(evidence).toBeTruthy();
    expect(evidence!.repo).toBe("testorg/testrepo");
    expect(evidence!.prNumber).toBe(42);

    const standard = {
      kind: "github-merge" as const,
      repo: "testorg/testrepo",
      prNumber: 42,
      deadline
    };

    const evaluationResult = await adapter.evaluateWithStandard(standard, evidence!);
    expect(evaluationResult).not.toBe("pending");

    if (evaluationResult === "pending") {
      throw new Error("Evaluation should not be pending for merged PR before deadline");
    }

    expect(evaluationResult.bps).toBe(10_000);

    // 6. SIGN: Attestor signs the verdict
    const signer = new AttestorSigner();
    const sig = await signer.sign({
      chainId: CHAIN_ID,
      escrow: promiseRef.address,
      payoutBps: evaluationResult.bps,
      evidenceHash: evaluationResult.evidenceHash
    });

    expect(sig.v).toBeGreaterThanOrEqual(27);
    expect(sig.r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sig.s).toMatch(/^0x[0-9a-f]{64}$/);

    // 7. RELAY: Submit the attestation on-chain
    const relay = new OracleRelay({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      adapterAddress,
      relayerPrivateKey: ANVIL_ACCOUNTS[0].key as Hex
    });

    await relay.relay(promiseRef.address, evaluationResult.bps, evaluationResult.evidenceHash, sig);

    // 8. VERIFY: Escrow is Paid, seeker has the full prize
    const publicClient = createPublicClient({
      transport: http(ANVIL_RPC),
      chain: {
        id: CHAIN_ID,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
      }
    });

    const finalState = await backend.status(promiseRef);
    expect(finalState.status).toBe("Paid");

    const seekerBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [seeker]
    });

    expect(seekerBalance).toBe(100_000_000n);

    const escrowBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [promiseRef.address]
    });

    expect(escrowBalance).toBe(0n);
  }, 30000);
});
