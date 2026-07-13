'use client';

import { useEffect, useState } from 'react';
import { FIRST_SIX_GRANTOR } from '@coldcash/shared';

/**
 * FundingStatus — honest grant verification gate
 *
 * Reads chain state for an armed grant backing a listing.
 * If grant found: FUNDED badge + grant ID + verify affordance
 * If not found: NOT FUNDED badge + honest messaging (no placeholder IDs)
 *
 * Tests enforce: rendering any fake identifier in NOT FUNDED state fails the suite.
 */

export interface FundingStatusProps {
  /**
   * Listing ID (for UI labeling)
   */
  listingId: string;

  /**
   * Expected grantor address (must match FIRST_SIX_GRANTOR)
   */
  expectedGrantor: string;

  /**
   * Launch flag — claim only enables when funded AND launched
   */
  isLaunched?: boolean;
}

export interface GrantState {
  grantId: string;
  lockedAmount: string;
  status: 'armed' | 'active' | 'completed';
}

export function FundingStatus({ listingId, expectedGrantor, isLaunched = false }: FundingStatusProps) {
  const [loading, setLoading] = useState(true);
  const [grant, setGrant] = useState<GrantState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkFunding() {
      setLoading(true);
      setError(null);

      try {
        // TODO: Replace with real chain read via api client
        // const response = await fetch(`/api/grants?grantor=${expectedGrantor}`);
        // const data = await response.json();
        // if (data.grants && data.grants.length > 0) {
        //   setGrant(data.grants[0]);
        // } else {
        //   setGrant(null);
        // }

        // For now, always return null (NOT FUNDED) until real chain integration
        setGrant(null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    checkFunding();
  }, [expectedGrantor]);

  if (loading) {
    return (
      <div className="bg-white rounded-warm border border-cream-300 p-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-warmAccent-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-ink-600">Checking funding status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-warm border border-red-200 p-4">
        <p className="text-sm text-red-800">Failed to check funding: {error}</p>
      </div>
    );
  }

  // NOT FUNDED state (current reality)
  if (!grant) {
    return (
      <div className="bg-amber-50/50 rounded-warm border-2 border-amber-400/60 p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-400/20 flex items-center justify-center">
            <span className="text-2xl">⏳</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block px-3 py-1 bg-amber-500 text-white text-xs font-bold uppercase tracking-wide rounded-full">
                NOT FUNDED
              </span>
            </div>
            <h3 className="font-display text-lg font-semibold text-ink-900 mb-2">
              Awaiting on-chain escrow
            </h3>
            <p className="text-sm text-ink-700 leading-relaxed">
              This listing is not yet funded. When funding is escrowed on-chain, the grant ID will appear here for independent verification.
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-amber-300/50">
          <p className="text-xs text-ink-600">
            <strong>Expected grantor:</strong>{' '}
            <code className="bg-white px-2 py-0.5 rounded border border-cream-300 text-[10px] break-all">
              {expectedGrantor}
            </code>
          </p>
        </div>
      </div>
    );
  }

  // FUNDED state (when grant exists on-chain)
  return (
    <div className="bg-success-50/50 rounded-warm border-2 border-success-500/60 p-6">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-success-500/20 flex items-center justify-center">
          <span className="text-2xl">✓</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block px-3 py-1 bg-success-500 text-white text-xs font-bold uppercase tracking-wide rounded-full">
              FUNDED
            </span>
          </div>
          <h3 className="font-display text-lg font-semibold text-ink-900 mb-2">
            Escrow verified on-chain
          </h3>
          <p className="text-sm text-ink-700 leading-relaxed mb-3">
            This listing is backed by an armed grant on ChronX. You can verify the grant independently.
          </p>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between bg-white rounded border border-cream-300 p-2">
              <span className="text-ink-600 font-medium">Grant ID:</span>
              <code className="text-xs text-ink-900 font-mono">{grant.grantId}</code>
            </div>
            <div className="flex items-center justify-between bg-white rounded border border-cream-300 p-2">
              <span className="text-ink-600 font-medium">Locked amount:</span>
              <span className="text-ink-900 font-semibold">{grant.lockedAmount} KX</span>
            </div>
            <div className="flex items-center justify-between bg-white rounded border border-cream-300 p-2">
              <span className="text-ink-600 font-medium">Status:</span>
              <span className="text-ink-900 font-semibold capitalize">{grant.status}</span>
            </div>
          </div>
        </div>
      </div>

      {!isLaunched && (
        <div className="mt-4 pt-4 border-t border-success-300/50">
          <p className="text-xs text-ink-600">
            Grant is armed but program has not launched yet. Claim will enable when launch flag is set.
          </p>
        </div>
      )}
    </div>
  );
}
