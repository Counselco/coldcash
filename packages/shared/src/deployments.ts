import type { Address } from "./types";

/**
 * Typed per-chain registry of deployed ColdCash contract addresses.
 *
 * To add a new deployment:
 * 1. Run the deploy script (see docs/DEPLOY.md)
 * 2. Copy the JSON output from the script
 * 3. Paste it into the appropriate chainId entry below
 *
 * Chain IDs:
 * - 31337: Local anvil (ephemeral, for testing only)
 * - 421614: Arbitrum Sepolia testnet
 * - 42161: Arbitrum One mainnet (future)
 */

export interface Deployment {
  chainId: number;
  factory: Address;
  adapter: Address;
  usdc: Address;
}

export const deployments: Record<number, Deployment> = {
  // Arbitrum Sepolia testnet
  // Paste the deploy script's JSON output here after deployment
  421614: {
    chainId: 421614,
    factory: "0x0000000000000000000000000000000000000000" as Address,
    adapter: "0x0000000000000000000000000000000000000000" as Address,
    usdc: "0x0000000000000000000000000000000000000000" as Address, // Circle's canonical Arbitrum Sepolia USDC
  },
};

/**
 * Get deployment for a given chain ID.
 * Throws if the chain is not supported.
 */
export function getDeployment(chainId: number): Deployment {
  const deployment = deployments[chainId];
  if (!deployment) {
    throw new Error(
      `No deployment found for chain ${chainId}. Supported chains: ${Object.keys(deployments).join(", ")}`
    );
  }
  return deployment;
}

/**
 * Check if a chain ID has a deployment.
 */
export function hasDeployment(chainId: number): boolean {
  return chainId in deployments;
}
