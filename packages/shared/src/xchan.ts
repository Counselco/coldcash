import type { Address } from "./types.js";
import type { RateProvider } from "./types.js";

export interface XChanQuote {
  usdc: number;
  rate: number | null;  // null if API doesn't provide verified rate
  asOf: number | null;  // null if API doesn't provide timestamp
  maxSwapUsd: number;
  reserveStatus: string;
  hasProvenance: boolean;  // true only if API provided rate AND as_of
}

export interface XChanRegistration {
  ref: string;
}

export type XChanDepositStatus = "watching" | "received" | "swapped" | "sent" | "unknown";

export interface XChanStatusResponse {
  found: boolean;
  status?: XChanDepositStatus;
  amountKx?: number;
  txRefs?: string[];
}

interface PriceApiResponse {
  price: number;
  price_usd?: number;
  currency?: string;
  source?: string;
  can_swap?: boolean;
  max_swap_usd?: number;
  reserve_status?: string;
  rate?: number;  // Verified rate from API (per XCHAN-API-REQUIREMENTS.md)
  as_of?: number; // Unix timestamp ms when rate was generated
}

interface RegisterApiResponse {
  ref?: string;
  reference?: string;
  status?: string;
}

interface StatusApiResponse {
  found: boolean;
  status?: string;
  amount_kx?: number;
  tx_refs?: string[];
}

export class XChanClient implements RateProvider {
  private readonly baseUrl: string;

  constructor(baseUrl = "https://api.chronx.io/api/xchan") {
    this.baseUrl = baseUrl;
  }

  async getKxToUsdcRate(): Promise<number | null> {
    const quote = await this.quoteKxToUsdc(1);
    return quote?.rate ?? null;
  }

  async quoteKxToUsdc(kx: number): Promise<XChanQuote | null> {
    try {
      const response = await fetch(`${this.baseUrl}/price`);
      if (!response.ok) return null;

      const data = (await response.json()) as PriceApiResponse;

      // Check for provenance: API must provide both rate AND as_of for verified data
      const hasProvenance = typeof data.rate === "number" && typeof data.as_of === "number";

      // Fallback to price/price_usd for compatibility, but mark as unverified
      const pricePerKx = hasProvenance ? data.rate! : (data.price_usd ?? data.price);
      if (typeof pricePerKx !== "number" || pricePerKx <= 0) return null;

      return {
        usdc: kx * pricePerKx,
        rate: hasProvenance ? data.rate! : null,
        asOf: hasProvenance ? data.as_of! : null,
        maxSwapUsd: data.max_swap_usd ?? 0,
        reserveStatus: data.reserve_status ?? "UNKNOWN",
        hasProvenance,
      };
    } catch (error) {
      console.error("XChan quote failed:", error);
      return null;
    }
  }

  async registerDestination(
    chronxAddr: string,
    baseUsdcAddr: Address
  ): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chronx_address: chronxAddr,
          base_address: baseUsdcAddr,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error("XChan registration failed:", error);
        return null;
      }

      const data = (await response.json()) as RegisterApiResponse;
      return data.ref ?? data.reference ?? "registered";
    } catch (error) {
      console.error("XChan registration error:", error);
      return null;
    }
  }

  async depositStatus(baseAddr: Address): Promise<XChanStatusResponse | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/bridge-status?base=${encodeURIComponent(baseAddr)}`
      );
      if (!response.ok) return null;

      const data = (await response.json()) as StatusApiResponse;

      if (!data.found) {
        return { found: false };
      }

      return {
        found: true,
        status: (data.status as XChanDepositStatus) ?? "unknown",
        amountKx: data.amount_kx,
        txRefs: data.tx_refs,
      };
    } catch (error) {
      console.error("XChan status check failed:", error);
      return null;
    }
  }
}
