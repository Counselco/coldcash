/**
 * First Six API Client — Stateless Chain Viewer
 *
 * TWO MODES (explicit, mutually exclusive):
 * - LIVE: api.uponproof.com endpoints backed by node RPC + seat engine
 * - PRE-LAUNCH: clearly labeled "Preview — program not yet launched"
 *
 * NO FIXTURE DISEASE: Pre-launch renders HONEST EMPTY STATES.
 * No fake hashes, no placeholder addresses, no invented numbers, ever.
 */

import {
  FIRST_SIX_GRANTOR,
  FIRST_SIX_SEAT_COUNT,
  FIRST_SIX_MONTHLY_CAP_USD,
  FIRST_SIX_WINDOW_COUNT,
  FIRST_SIX_SEAT_CAP_USD,
  FIRST_SIX_PROGRAM_CAP_USD,
  type SeatOpening,
} from "@coldcash/shared";

// ChronX address type (base58, not 0x-prefixed)
export type ChronxAddress = string;

// ============================================================================
// API MODE
// ============================================================================

export type ApiMode = "LIVE" | "PRE_LAUNCH";

/**
 * Get current API mode from environment
 *
 * Default: PRE_LAUNCH (safe default until Joseph flips the flag)
 */
export function getApiMode(): ApiMode {
  // Check for explicit LIVE flag
  if (typeof window !== "undefined") {
    // Client-side: check window.COLDCASH_FIRST_SIX_LIVE
    return (window as any).COLDCASH_FIRST_SIX_LIVE === true ? "LIVE" : "PRE_LAUNCH";
  }
  // Server-side: check process.env
  return process.env.NEXT_PUBLIC_FIRST_SIX_LIVE === "true" ? "LIVE" : "PRE_LAUNCH";
}

// ============================================================================
// PROGRAM STATE TYPES
// ============================================================================

export interface VaultState {
  grantorAddress: ChronxAddress;
  totalLocked: string | null; // KX amount, null if unavailable
  armedGrantCount: number | null; // null if unavailable
  totalDisbursed: string | null; // KX amount, null if unavailable
}

export interface SeatsState {
  openNow: number | null; // null if unavailable
  claimed: number | null; // null if unavailable
  total: number;
  nextSeatOpensAt: string | null; // ISO timestamp or null
}

export interface OperatorDashboard {
  operatorAddress: ChronxAddress;
  seatNumber: number | null;
  grantId: string | null;
  currentWindow: number | null;
  windows: WindowRecord[];
  totalEarned: string | null; // USD or null
}

export interface WindowRecord {
  window: number;
  startDate: string | null; // ISO timestamp or null
  endDate: string | null; // ISO timestamp or null
  uptimePercent: number | null; // 0-100 or null
  payoutUsd: string | null; // USD amount or null
  payoutKx: string | null; // KX amount or null
  txId: string | null; // ChronX tx ID or null
  source: string | null; // "probe-attested" | "consensus-verified" or null
}

// ============================================================================
// API CLIENT
// ============================================================================

export class FirstSixApiClient {
  private mode: ApiMode;
  private baseUrl: string;

  constructor(mode?: ApiMode) {
    this.mode = mode || getApiMode();
    this.baseUrl = this.mode === "LIVE" ? "https://api.uponproof.com" : "";
  }

  /**
   * Get current API mode
   */
  getMode(): ApiMode {
    return this.mode;
  }

  /**
   * Get vault state (armed pool / locked KX)
   */
  async getVaultState(): Promise<VaultState> {
    if (this.mode === "PRE_LAUNCH") {
      return {
        grantorAddress: FIRST_SIX_GRANTOR,
        totalLocked: null,
        armedGrantCount: null,
        totalDisbursed: null,
      };
    }

    // LIVE mode: fetch from API
    const response = await fetch(`${this.baseUrl}/first-six/vault`);
    if (!response.ok) {
      throw new Error(`Failed to fetch vault state: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get seats state (open/claimed/next-opens)
   */
  async getSeatsState(): Promise<SeatsState> {
    if (this.mode === "PRE_LAUNCH") {
      return {
        openNow: null,
        claimed: null,
        total: FIRST_SIX_SEAT_COUNT,
        nextSeatOpensAt: null,
      };
    }

    // LIVE mode: fetch from API
    const response = await fetch(`${this.baseUrl}/first-six/seats`);
    if (!response.ok) {
      throw new Error(`Failed to fetch seats state: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get operator dashboard (per-seat live view)
   */
  async getOperatorDashboard(operatorAddress: ChronxAddress): Promise<OperatorDashboard | null> {
    if (this.mode === "PRE_LAUNCH") {
      return {
        operatorAddress,
        seatNumber: null,
        grantId: null,
        currentWindow: null,
        windows: [],
        totalEarned: null,
      };
    }

    // LIVE mode: fetch from API
    const response = await fetch(`${this.baseUrl}/first-six/operator/${operatorAddress}`);
    if (response.status === 404) {
      return null; // Operator not found
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch operator dashboard: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get valve state (enrollment paused?)
   */
  async getValveState(): Promise<{ isPaused: boolean; reason?: string } | null> {
    if (this.mode === "PRE_LAUNCH") {
      return null; // No valve state in pre-launch
    }

    // LIVE mode: fetch from API
    const response = await fetch(`${this.baseUrl}/first-six/valve`);
    if (!response.ok) {
      throw new Error(`Failed to fetch valve state: ${response.statusText}`);
    }
    return response.json();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton API client (auto-detects mode from environment)
 */
export const firstSixApi = new FirstSixApiClient();

// ============================================================================
// PROGRAM CONSTANTS (for display)
// ============================================================================

export const FIRST_SIX_CONSTANTS = {
  GRANTOR: FIRST_SIX_GRANTOR,
  SEAT_COUNT: FIRST_SIX_SEAT_COUNT,
  MONTHLY_CAP_USD: FIRST_SIX_MONTHLY_CAP_USD,
  WINDOW_COUNT: FIRST_SIX_WINDOW_COUNT,
  SEAT_CAP_USD: FIRST_SIX_SEAT_CAP_USD,
  PROGRAM_CAP_USD: FIRST_SIX_PROGRAM_CAP_USD,
  UPTIME_FLOOR: 80, // 80% uptime floor
} as const;
