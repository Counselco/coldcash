/**
 * ChronX wallet utilities
 */

export interface ChronxPayUriParams {
  to: string;          // Recipient wallet address
  amount: string;      // Amount in whole KX (e.g., "1000" for 1000 KX)
  memo?: string;       // Optional memo text
  ref?: string;        // Optional reference ID
}

/**
 * Builds a chronx://pay deep link URI for the ChronX wallet.
 *
 * The wallet's Send form expects amount in whole KX units (not base units).
 * For example, to send 1000 KX, pass amount: "1000".
 *
 * @param params - Payment parameters
 * @returns chronx://pay?to=...&amount=...&memo=...&ref=...
 *
 * @example
 * const uri = buildChronxPayUri({
 *   to: "0x1234...",
 *   amount: "1000",
 *   memo: "coldcash-g0001:0xa41ba9ff",
 *   ref: "coldcash-g0001"
 * });
 * // => "chronx://pay?to=0x1234...&amount=1000&memo=coldcash-g0001%3A0xa41ba9ff&ref=coldcash-g0001"
 */
export function buildChronxPayUri(params: ChronxPayUriParams): string {
  const query = new URLSearchParams({
    to: params.to,
    amount: params.amount,
  });

  if (params.memo) {
    query.set('memo', params.memo);
  }

  if (params.ref) {
    query.set('ref', params.ref);
  }

  return `chronx://pay?${query.toString()}`;
}
