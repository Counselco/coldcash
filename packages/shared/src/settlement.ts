import type { Address, Hex } from "./types.js";
import type { PromiseParams, PromiseRef, PromiseState, TxRef } from "./types.js";

export interface SettlementBackend {
  createPromise(params: PromiseParams): Promise<PromiseRef>;
  cancel(ref: PromiseRef): Promise<TxRef>;
  accept(ref: PromiseRef, seeker: Address): Promise<TxRef>;
  resolve(ref: PromiseRef, bps: number, evidenceHash: Hex): Promise<TxRef>;
  refund(ref: PromiseRef): Promise<TxRef>;
  status(ref: PromiseRef): Promise<PromiseState>;
}
