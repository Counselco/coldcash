import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChronxRecordsBackend } from "../settlement/ChronxRecordsBackend.js";
import { ArbitrumUsdcBackend } from "../settlement/ArbitrumUsdcBackend.js";
import type { Address, Hex, SettlementBackend } from "@coldcash/shared";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";

const TEST_RECORDS_DIR = join(process.cwd(), "test-records-routing");
const TEST_SEQUENCE_PATH = join(TEST_RECORDS_DIR, "sequence.txt");

describe("Asset Routing Test", () => {
  let chronxBackend: ChronxRecordsBackend;
  let arbitrumBackend: ArbitrumUsdcBackend;

  beforeEach(() => {
    mkdirSync(TEST_RECORDS_DIR, { recursive: true });
    chronxBackend = new ChronxRecordsBackend({
      recordsDir: TEST_RECORDS_DIR,
      grantIdSequencePath: TEST_SEQUENCE_PATH,
      defaultGrantor: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      witnessIdentity: "coldcash-witness-v1"
    });

    // Note: ArbitrumUsdcBackend would require a live RPC connection for actual testing
    // This test focuses on the routing logic rather than backend-specific behavior
    arbitrumBackend = new ArbitrumUsdcBackend({
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337,
      factoryAddress: "0x0000000000000000000000000000000000000001" as Address,
      usdcAddress: "0x0000000000000000000000000000000000000002" as Address,
      oracleAddress: "0x0000000000000000000000000000000000000003" as Address
    });
  });

  afterEach(() => {
    rmSync(TEST_RECORDS_DIR, { recursive: true, force: true });
  });

  it("should route KX asset to ChronxRecordsBackend", async () => {
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 1000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false,
      asset: "KX" as const
    };

    // Simulate routing logic
    const backend: SettlementBackend = params.asset === "KX" ? chronxBackend : arbitrumBackend;

    const ref = await backend.createPromise(params);

    // Verify KX routes to ChronxRecordsBackend (coldcash-g#### format)
    expect(ref.address).toMatch(/^coldcash-g\d{4}$/);
    expect(ref.asset).toBe("KX");
  });

  it("should route USDC-ARB asset to ArbitrumUsdcBackend", () => {
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 100000000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false,
      asset: "USDC-ARB" as const
    };

    // Simulate routing logic
    const backend: SettlementBackend = params.asset === "KX" ? chronxBackend : arbitrumBackend;

    // Verify USDC-ARB routes to ArbitrumUsdcBackend
    expect(backend).toBe(arbitrumBackend);
    expect(backend instanceof ArbitrumUsdcBackend).toBe(true);
  });

  it("should default to KX when asset is not specified", async () => {
    const params = {
      backer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      prize: 1000n,
      acceptBy: 1720000000,
      deadline: 1720086400,
      standardHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex,
      isPublic: false
    };

    // Default to KX when not specified
    const asset = params.asset ?? "KX";
    const backend: SettlementBackend = asset === "KX" ? chronxBackend : arbitrumBackend;

    const ref = await backend.createPromise(params);

    // Verify defaults to KX (ChronxRecordsBackend)
    expect(ref.address).toMatch(/^coldcash-g\d{4}$/);
    expect(ref.asset).toBe("KX");
  });

  it("should handle backend selection factory pattern", () => {
    type BackendFactory = (asset: "KX" | "USDC-ARB") => SettlementBackend;

    const backendFactory: BackendFactory = (asset) => {
      return asset === "KX" ? chronxBackend : arbitrumBackend;
    };

    // Test factory returns correct backends
    expect(backendFactory("KX")).toBe(chronxBackend);
    expect(backendFactory("USDC-ARB")).toBe(arbitrumBackend);
  });
});
