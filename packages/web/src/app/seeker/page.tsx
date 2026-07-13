'use client';

import Link from 'next/link';
import { FundingStatus } from '@/components/FundingStatus';
import { FIRST_SIX_GRANTOR } from '@coldcash/shared';

/**
 * /seeker — Live Listings Board
 *
 * Real listings surface (mobile-responsive, static export).
 * First listing: ChronX Node Operator
 * Honest funding gate via FundingStatus component.
 */
export default function SeekerPage() {
  // Program launch flag (default: OFF until Joseph flips it)
  // In production, this would come from env or chain state
  const isProgramLaunched = false;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <Link href="/" className="text-sm text-warmAccent-600 hover:text-warmAccent-700 font-medium">
          ← Home
        </Link>
        <h1 className="font-display text-4xl md:text-5xl font-bold text-ink-900 mt-4 mb-3">
          Open listings
        </h1>
        <p className="text-lg text-ink-700 leading-relaxed">
          Clear tasks. Proof-verified payment. No phantom waitlists — listings show only when funded.
        </p>
      </div>

      {/* Listing 1: ChronX Node Operator */}
      <article className="bg-white rounded-warm-lg shadow-warm border-2 border-warmAccent-400/40 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-warmAccent-500/10 via-white to-amber-50 p-6 md:p-8 border-b border-cream-300">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block px-3 py-1 bg-warmAccent-500 text-white text-xs font-bold uppercase tracking-wide rounded-full">
                  Open
                </span>
                <span className="text-sm text-ink-600">ChronX</span>
              </div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-ink-900 mb-2">
                ChronX Node Operator
              </h2>
              <p className="text-xl font-semibold text-ink-800">
                $10 USD/month · 12 monthly payments · proven uptime
              </p>
            </div>
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/80 rounded-warm border border-cream-300 p-3 text-center">
              <p className="text-2xl font-bold text-ink-900">$10</p>
              <p className="text-xs text-ink-600">USD per month</p>
            </div>
            <div className="bg-white/80 rounded-warm border border-cream-300 p-3 text-center">
              <p className="text-2xl font-bold text-ink-900">12</p>
              <p className="text-xs text-ink-600">monthly windows</p>
            </div>
            <div className="bg-white/80 rounded-warm border border-cream-300 p-3 text-center">
              <p className="text-2xl font-bold text-ink-900">$120</p>
              <p className="text-xs text-ink-600">total per operator</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 space-y-6">
          {/* What's needed */}
          <section>
            <h3 className="font-display text-xl font-semibold text-ink-900 mb-3">
              What's needed
            </h3>
            <p className="text-ink-700 leading-relaxed mb-3">
              Run a <strong>real, reachable ChronX node</strong> serving RPC traffic. Keep it operational throughout the payment period.
            </p>
            <ul className="space-y-2 text-sm text-ink-700">
              <li className="flex gap-2 items-start">
                <span className="text-warmAccent-600 flex-shrink-0">•</span>
                <span>Official ChronX node software (live network)</span>
              </li>
              <li className="flex gap-2 items-start">
                <span className="text-warmAccent-600 flex-shrink-0">•</span>
                <span>Publicly reachable endpoint</span>
              </li>
              <li className="flex gap-2 items-start">
                <span className="text-warmAccent-600 flex-shrink-0">•</span>
                <span>Operational uptime maintained throughout payment windows</span>
              </li>
            </ul>
            <p className="mt-3 text-sm text-ink-600">
              📖{' '}
              <a
                href="https://chronx.io/docs/node-setup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-warmAccent-600 font-medium hover:text-warmAccent-700"
              >
                Node setup documentation
              </a>
            </p>
          </section>

          {/* How you get paid */}
          <section className="border-t border-cream-300 pt-6">
            <h3 className="font-display text-xl font-semibold text-ink-900 mb-3">
              How you get paid
            </h3>
            <div className="space-y-3 text-ink-700 leading-relaxed">
              <p>
                <strong className="text-ink-900">Amount:</strong> $10 per month, denominated in USD and paid as anchored KX. Up to 12 monthly payments.
              </p>
              <p>
                <strong className="text-ink-900">Schedule:</strong> Each month's payment releases based on verified operational uptime. Partial months follow the payout curve and floor exactly as specified in the{' '}
                <Link href="/docs/first-six" className="text-warmAccent-600 font-medium hover:text-warmAccent-700">
                  program documentation
                </Link>
                .
              </p>
              <p>
                <strong className="text-ink-900">Curve and floor:</strong> Payments follow a linear curve from 80% uptime floor to 100%. Below 80% uptime in any month results in $0 for that month (unearned funds revert to treasury, no rollover).
              </p>
              <p>
                <strong className="text-ink-900">Receipts:</strong> Permanent on-chain receipts (TxId) for each payment window. Full payment history visible on your operator dashboard.
              </p>
            </div>
          </section>

          {/* Verification */}
          <section className="border-t border-cream-300 pt-6">
            <h3 className="font-display text-xl font-semibold text-ink-900 mb-3">
              Verification (honest disclosure)
            </h3>
            <div className="bg-amber-50 border border-amber-300 rounded-warm p-4 mb-3">
              <p className="text-sm text-amber-900 font-medium mb-2">
                Version 1: Probe-attested uptime
              </p>
              <p className="text-sm text-amber-900 leading-relaxed">
                Our attestor pings your node's RPC endpoint on a regular schedule (e.g., every 15 minutes) and verifies real-node response fingerprints. A proxy or mock endpoint will fail the standard.
              </p>
            </div>
            <p className="text-sm text-ink-700 leading-relaxed">
              All uptime records are labeled <strong>"probe-attested"</strong> in your dashboard and receipts. This sensor will upgrade to node-native ChronX chain metrics when available, with no change required from operators.
            </p>
            <p className="mt-3 text-sm text-ink-600">
              <strong>Anti-fraud standard (frozen):</strong> "A real, reachable node serving RPC traffic. A mock endpoint, proxy forwarding to someone else's node, or unreachable address does NOT satisfy the standard."
            </p>
          </section>

          {/* Funding status */}
          <section className="border-t border-cream-300 pt-6">
            <h3 className="font-display text-xl font-semibold text-ink-900 mb-3">
              Funding status
            </h3>
            <FundingStatus
              listingId="chronx-node-operator"
              expectedGrantor={FIRST_SIX_GRANTOR}
              isLaunched={isProgramLaunched}
            />
          </section>

          {/* Claiming */}
          <section className="border-t border-cream-300 pt-6">
            <h3 className="font-display text-xl font-semibold text-ink-900 mb-3">
              Claiming
            </h3>
            <div className="space-y-3 text-ink-700 leading-relaxed mb-4">
              <p>
                <strong className="text-ink-900">First-come-first-served:</strong> Claims are resolved by DAG commit order on ChronX (consensus-ordered fairness, no site discretion).
              </p>
              <p>
                <strong className="text-ink-900">Claim bond:</strong> Submit a refundable KX bond with your claim (e.g., 10 KX). If your claim succeeds, the bond is consumed. If you lose the race or the seat is already taken, your bond returns automatically.
              </p>
            </div>

            {/* Claim button (disabled until funded + launched) */}
            <div className="space-y-3">
              <button
                disabled
                className="w-full px-6 py-4 bg-ink-300 text-white font-semibold text-lg rounded-warm cursor-not-allowed opacity-60"
              >
                Claim this listing
              </button>
              <p className="text-sm text-ink-600 text-center">
                {!isProgramLaunched
                  ? 'Claiming will enable when the program is funded and launched.'
                  : 'Claiming will enable when on-chain funding is verified.'}
              </p>
            </div>
          </section>
        </div>
      </article>

      {/* Footer note */}
      <div className="text-sm text-ink-600 border-t border-cream-300 pt-6">
        <p>
          <strong className="text-ink-800">Seats:</strong> New seats open only when the backer prefunds them. No phantom waitlists or reserved spots.
        </p>
        <p className="mt-2">
          <strong className="text-ink-800">Program documentation:</strong>{' '}
          <Link href="/docs/first-six" className="text-warmAccent-600 font-medium hover:text-warmAccent-700">
            FIRST-SIX-PROGRAM.md
          </Link>
        </p>
      </div>
    </div>
  );
}
