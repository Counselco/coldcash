import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  getAddress,
  parseAbi,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ArbitrumUsdcBackend } from "../settlement/ArbitrumUsdcBackend.js";
import { intake } from "../routes/promises.js";
import { NodeUptimeAdapter, FixtureTelemetryClient } from "@coldcash/oracle/dist/adapters/node-uptime.js";
import { AttestorSigner } from "@coldcash/oracle/dist/attestor.js";
import { OracleRelay } from "@coldcash/oracle/dist/relay.js";

import promiseFactoryArtifact from "../../../contracts/out/PromiseFactory.sol/PromiseFactory.json" with { type: "json" };
import namedAttestorAdapterArtifact from "../../../contracts/out/NamedAttestorAdapter.sol/NamedAttestorAdapter.json" with { type: "json" };
import mockUsdcArtifact from "../../../contracts/out/PromiseEscrow.t.sol/MockUSDC.json" with { type: "json" };

const ANVIL_PORT = process.env.ANVIL_PORT ? parseInt(process.env.ANVIL_PORT) : 8548;
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
const NamedAttestorAdapterAbi = namedAttestorAdapterArtifact.abi;

/**
 * P4: Public bounty lane E2E tests
 * Tests the open-offer flow with 3% publication fee and node-uptime graded payouts
 */
describe("Public Lane E2E Tests", () => {
  let anvilProcess: ChildProcess;
  let usdcAddress: Address;
  let factoryAddress: Address;
  let adapterAddress: Address;
  let attestorKey: Hex;
  let attestorAddress: Address;
  let feeRecipient: Address;

  beforeAll(async () => {
    attestorKey = ANVIL_ACCOUNTS[4].key as Hex;
    attestorAddress = getAddress(ANVIL_ACCOUNTS[4].address);
    feeRecipient = getAddress(ANVIL_ACCOUNTS[3].address);
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

  it("(a) open offer created with 3% fee skimmed, prize whole", async () => {
    const backend = new ArbitrumUsdcBackend({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      factoryAddress,
      usdcAddress,
      oracleAddress: adapterAddress,
      signerPrivateKey: ANVIL_ACCOUNTS[1].key as Hex
    });

    const publicClient = createPublicClient({
      transport: http(ANVIL_RPC),
      chain: {
        id: CHAIN_ID,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
      }
    });

    const backer = getAddress(ANVIL_ACCOUNTS[1].address);

    const backerBalanceBefore = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [backer]
    }) as bigint;

    const feeBalanceBefore = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [feeRecipient]
    }) as bigint;

    // Create open offer (namedSeeker not specified → defaults to zero address)
    const promiseRef = await backend.createPromise({
      backer,
      prize: 100_000_000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 604800,
      standardHash: "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
      isPublic: true
      // namedSeeker omitted → open offer
    });

    const escrowBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [promiseRef.address]
    });

    const backerBalanceAfter = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [backer]
    }) as bigint;

    const feeBalanceAfter = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [feeRecipient]
    }) as bigint;

    // Prize stays whole in escrow
    expect(escrowBalance).toBe(100_000_000n);
    // Backer paid prize + 3% fee
    expect(backerBalanceBefore - backerBalanceAfter).toBe(103_000_000n);
    // Fee recipient received 3%
    expect(feeBalanceAfter - feeBalanceBefore).toBe(3_000_000n);
  }, 30000);

  it("(b) public lane: open node-uptime offer → first accept → partial uptime → graded payout → backer receives remainder", async () => {
    const backend = new ArbitrumUsdcBackend({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      factoryAddress,
      usdcAddress,
      oracleAddress: adapterAddress,
      signerPrivateKey: ANVIL_ACCOUNTS[1].key as Hex
    });

    const publicClient = createPublicClient({
      transport: http(ANVIL_RPC),
      chain: {
        id: CHAIN_ID,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
      }
    });

    const backer = getAddress(ANVIL_ACCOUNTS[1].address);
    const stranger = getAddress(ANVIL_ACCOUNTS[2].address);

    const backerBalanceBefore = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [backer]
    }) as bigint;

    // 1. Intake: node-uptime offer
    // Note: measurement deadline is separate from on-chain resolution deadline
    const measurementDeadline = Math.floor(Date.now() / 1000) + 1800;
    const onChainDeadline = measurementDeadline + 3600; // resolution must happen before this

    const intakeResult = await intake({
      wish: `node chronx-test-1 online 7 of 30 days by ${measurementDeadline}`,
      backerAddress: backer,
      isPublic: true,
    });

    expect(intakeResult.kind).toBe("node-uptime");

    // 2. Create open offer
    const promiseRef = await backend.createPromise({
      backer,
      prize: 100_000_000n,
      acceptBy: Math.floor(Date.now() / 1000) + 900,
      deadline: onChainDeadline,
      standardHash: intakeResult.frozen.standardHash as Hex,
      isPublic: true
    });

    // 3. Stranger accepts (first accept wins)
    const strangerBackend = new ArbitrumUsdcBackend({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      factoryAddress,
      usdcAddress,
      oracleAddress: adapterAddress,
      signerPrivateKey: ANVIL_ACCOUNTS[2].key as Hex
    });

    await strangerBackend.accept(promiseRef, stranger);

    const stateAfterAccept = await backend.status(promiseRef);
    expect(stateAfterAccept.status).toBe("Accepted");
    expect(stateAfterAccept.seeker).toBe(stranger);

    // 4. Setup fixture telemetry: partial uptime (5 of 7 required days)
    const telemetryClient = new FixtureTelemetryClient();
    telemetryClient.setUptime("chronx-test-1", 5, 30);

    const adapter = new NodeUptimeAdapter(telemetryClient);
    const standard = {
      kind: "node-uptime" as const,
      nodeId: "chronx-test-1",
      requiredDays: 7,
      windowDays: 30,
      deadline: measurementDeadline
    };

    // 5. Time travel past measurement deadline (but before on-chain deadline)
    const anvilClient = createWalletClient({
      account: privateKeyToAccount(ANVIL_ACCOUNTS[0].key as Hex),
      transport: http(ANVIL_RPC),
      chain: {
        id: CHAIN_ID,
        name: "anvil",
        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ANVIL_RPC] }, public: { http: [ANVIL_RPC] } }
      }
    });

    await anvilClient.request({
      method: "evm_increaseTime" as any,
      params: [1900] as any // past measurement deadline, before on-chain deadline
    });

    await anvilClient.request({
      method: "evm_mine" as any,
      params: [] as any
    });

    // 6. Evaluate: 5/7 = ~71.4% → 7142 bps (floor)
    const evaluationResult = await adapter.evaluateWithStandard(standard, measurementDeadline + 100);
    expect(evaluationResult).not.toBe("pending");

    if (evaluationResult === "pending") {
      throw new Error("Should not be pending");
    }

    expect(evaluationResult.bps).toBe(7_142); // floor(5/7 * 10000)

    // 7. Sign and relay
    const signer = new AttestorSigner();
    const sig = await signer.sign({
      chainId: CHAIN_ID,
      escrow: promiseRef.address,
      payoutBps: evaluationResult.bps,
      evidenceHash: evaluationResult.evidenceHash
    });

    const relay = new OracleRelay({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      adapterAddress,
      relayerPrivateKey: ANVIL_ACCOUNTS[0].key as Hex
    });

    await relay.relay(promiseRef.address, evaluationResult.bps, evaluationResult.evidenceHash, sig);

    // 8. Verify: seeker gets graded amount, backer gets remainder
    const strangerBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [stranger]
    });

    const backerBalanceAfter = await publicClient.readContract({
      address: usdcAddress,
      abi: MockUsdcAbi,
      functionName: "balanceOf",
      args: [backer]
    }) as bigint;

    const expectedSeekerPayout = (100_000_000n * BigInt(evaluationResult.bps)) / 10_000n;
    const expectedBackerRefund = 100_000_000n - expectedSeekerPayout;

    expect(strangerBalance).toBe(expectedSeekerPayout); // ~71.42 USDC
    expect(backerBalanceAfter - backerBalanceBefore).toBe(-103_000_000n + expectedBackerRefund);

    const finalState = await backend.status(promiseRef);
    expect(finalState.status).toBe("Paid");
  }, 30000);

  it("(c) second accept attempt rejected (contract enforces first-accept-wins)", async () => {
    const backend = new ArbitrumUsdcBackend({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      factoryAddress,
      usdcAddress,
      oracleAddress: adapterAddress,
      signerPrivateKey: ANVIL_ACCOUNTS[1].key as Hex
    });

    const backer = getAddress(ANVIL_ACCOUNTS[1].address);
    const firstSeeker = getAddress(ANVIL_ACCOUNTS[2].address);
    const secondSeeker = getAddress(ANVIL_ACCOUNTS[3].address);

    // Create open offer
    const promiseRef = await backend.createPromise({
      backer,
      prize: 100_000_000n,
      acceptBy: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 604800,
      standardHash: "0x0000000000000000000000000000000000000000000000000000000000000099" as Hex,
      isPublic: true
    });

    // First accept
    const firstBackend = new ArbitrumUsdcBackend({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      factoryAddress,
      usdcAddress,
      oracleAddress: adapterAddress,
      signerPrivateKey: ANVIL_ACCOUNTS[2].key as Hex
    });

    await firstBackend.accept(promiseRef, firstSeeker);

    const stateAfterFirst = await backend.status(promiseRef);
    expect(stateAfterFirst.status).toBe("Accepted");
    expect(stateAfterFirst.seeker).toBe(firstSeeker);

    // Second accept should fail
    const secondBackend = new ArbitrumUsdcBackend({
      rpcUrl: ANVIL_RPC,
      chainId: CHAIN_ID,
      factoryAddress,
      usdcAddress,
      oracleAddress: adapterAddress,
      signerPrivateKey: ANVIL_ACCOUNTS[3].key as Hex
    });

    await expect(
      secondBackend.accept(promiseRef, secondSeeker)
    ).rejects.toThrow();
  }, 30000);
});
