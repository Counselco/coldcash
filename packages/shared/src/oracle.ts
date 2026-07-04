import type { Hex } from "./types.js";
import type { PromiseRecord } from "./types.js";

export interface OracleAdapter {
  id: string;
  evaluate(promise: PromiseRecord): Promise<{ bps: number; evidenceHash: Hex } | "pending">;
}
