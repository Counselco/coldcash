import { describe, it, expect, beforeEach, vi } from "vitest";
import { XChanClient } from "./xchan.js";

describe("XChanClient", () => {
  let client: XChanClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    client = new XChanClient("https://test.api/xchan");
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  describe("quoteKxToUsdc", () => {
    it("returns quote when API responds successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          price: 0.003076975421609258,
          price_usd: 0.003076975421609258,
          currency: "USD",
          source: "v4_slot0",
          can_swap: true,
          max_swap_usd: 332.5,
          reserve_status: "OK",
        }),
      });

      const result = await client.quoteKxToUsdc(1000);

      expect(result).not.toBeNull();
      expect(result!.usdc).toBeCloseTo(3.077, 3);
      expect(result!.rate).toBeCloseTo(0.003077, 6);
      expect(result!.maxSwapUsd).toBe(332.5);
      expect(result!.reserveStatus).toBe("OK");
      expect(result!.asOf).toBeGreaterThan(Date.now() - 1000);
    });

    it("calculates correct USDC for different KX amounts", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          price: 0.005,
          price_usd: 0.005,
        }),
      });

      const result = await client.quoteKxToUsdc(2000);

      expect(result).not.toBeNull();
      expect(result!.usdc).toBe(10);
      expect(result!.rate).toBe(0.005);
    });

    it("returns null when API returns non-ok status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      const result = await client.quoteKxToUsdc(1000);

      expect(result).toBeNull();
    });

    it("returns null when price is invalid", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          price: -0.001,
        }),
      });

      const result = await client.quoteKxToUsdc(1000);

      expect(result).toBeNull();
    });

    it("returns null when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await client.quoteKxToUsdc(1000);

      expect(result).toBeNull();
    });

    it("falls back to price when price_usd is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          price: 0.004,
        }),
      });

      const result = await client.quoteKxToUsdc(500);

      expect(result).not.toBeNull();
      expect(result!.usdc).toBe(2);
      expect(result!.rate).toBe(0.004);
    });

    it("defaults missing fields to safe values", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          price: 0.003,
        }),
      });

      const result = await client.quoteKxToUsdc(1000);

      expect(result).not.toBeNull();
      expect(result!.maxSwapUsd).toBe(0);
      expect(result!.reserveStatus).toBe("UNKNOWN");
    });
  });

  describe("getKxToUsdcRate", () => {
    it("returns rate for 1 KX", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          price: 0.0035,
        }),
      });

      const rate = await client.getKxToUsdcRate();

      expect(rate).toBe(0.0035);
      expect(mockFetch).toHaveBeenCalledWith("https://test.api/xchan/price");
    });

    it("returns null when quote fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      const rate = await client.getKxToUsdcRate();

      expect(rate).toBeNull();
    });
  });

  describe("registerDestination", () => {
    const chronxAddr = "FGSemyJdkCU85D4qQNWFd158J44MANAHTAF5Qx974WRR";
    const baseAddr = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";

    it("successfully registers destination", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ref: "reg_abc123",
          status: "registered",
        }),
      });

      const ref = await client.registerDestination(chronxAddr, baseAddr);

      expect(ref).toBe("reg_abc123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test.api/xchan/register",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chronx_address: chronxAddr,
            base_address: baseAddr,
          }),
        })
      );
    });

    it("falls back to reference field if ref missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reference: "reg_xyz789",
        }),
      });

      const ref = await client.registerDestination(chronxAddr, baseAddr);

      expect(ref).toBe("reg_xyz789");
    });

    it("returns generic success when no ref in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
        }),
      });

      const ref = await client.registerDestination(chronxAddr, baseAddr);

      expect(ref).toBe("registered");
    });

    it("returns null when API returns error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "invalid_address",
        }),
      });

      const ref = await client.registerDestination(chronxAddr, baseAddr);

      expect(ref).toBeNull();
    });

    it("returns null when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const ref = await client.registerDestination(chronxAddr, baseAddr);

      expect(ref).toBeNull();
    });
  });

  describe("depositStatus", () => {
    const baseAddr = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";

    it("returns status when deposit found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          found: true,
          status: "swapped",
          amount_kx: 1000,
          tx_refs: ["tx1", "tx2"],
        }),
      });

      const status = await client.depositStatus(baseAddr);

      expect(status).toEqual({
        found: true,
        status: "swapped",
        amountKx: 1000,
        txRefs: ["tx1", "tx2"],
      });
      expect(mockFetch).toHaveBeenCalledWith(
        `https://test.api/xchan/bridge-status?base=${encodeURIComponent(baseAddr)}`
      );
    });

    it("returns found: false when no deposit", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          found: false,
        }),
      });

      const status = await client.depositStatus(baseAddr);

      expect(status).toEqual({
        found: false,
      });
    });

    it("defaults to unknown status when missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          found: true,
          amount_kx: 500,
        }),
      });

      const status = await client.depositStatus(baseAddr);

      expect(status).toEqual({
        found: true,
        status: "unknown",
        amountKx: 500,
        txRefs: undefined,
      });
    });

    it("returns null when API returns error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      const status = await client.depositStatus(baseAddr);

      expect(status).toBeNull();
    });

    it("returns null when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const status = await client.depositStatus(baseAddr);

      expect(status).toBeNull();
    });
  });
});
