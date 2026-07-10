'use client';

import { FIRST_SIX_CONSTANTS } from '@/lib/first-six-api';

export function FirstSixHowItWorks() {
  return (
    <section className="bg-white rounded-warm-lg shadow-warm p-8 md:p-12 border border-cream-300">
      <h2 className="font-display text-3xl font-semibold text-ink-900 text-center mb-8">
        How It Works — For Operators
      </h2>

      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-warmAccent-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">1️⃣</span>
          </div>
          <h4 className="font-semibold text-ink-900 mb-3 text-lg">Claim Your Seat</h4>
          <p className="text-sm text-ink-600 leading-relaxed">
            First-come-first-served (DAG commit order). Submit your claim transaction
            with a small refundable bond + proof-of-work. Winner gets the grant armed;
            losers' bonds return automatically.
          </p>
        </div>

        <div className="text-center">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">2️⃣</span>
          </div>
          <h4 className="font-semibold text-ink-900 mb-3 text-lg">Run Your Node</h4>
          <p className="text-sm text-ink-600 leading-relaxed">
            Keep your ChronX node reachable and serving RPC traffic. Monthly uptime
            is measured via probe-based attestation (v1). Hit 80%+ uptime to earn that month's payout.
          </p>
        </div>

        <div className="text-center">
          <div className="w-20 h-20 bg-success-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">3️⃣</span>
          </div>
          <h4 className="font-semibold text-ink-900 mb-3 text-lg">Paid on Proof</h4>
          <p className="text-sm text-ink-600 leading-relaxed">
            Monthly payout calculated on a linear curve: 100% uptime = ${FIRST_SIX_CONSTANTS.MONTHLY_CAP_USD},
            90% = ${FIRST_SIX_CONSTANTS.MONTHLY_CAP_USD * 0.9}. Below 80% = $0 (floor). Payments
            settle in KX on-chain.
          </p>
        </div>
      </div>

      <div className="bg-cream-100 border border-cream-300 rounded-warm p-6 space-y-4">
        <div>
          <p className="font-semibold text-ink-900 mb-2">📊 Payout Curve (Linear)</p>
          <div className="space-y-1 text-sm text-ink-700">
            <p>• 100% uptime → ${FIRST_SIX_CONSTANTS.MONTHLY_CAP_USD}/month</p>
            <p>• 90% uptime → ${FIRST_SIX_CONSTANTS.MONTHLY_CAP_USD * 0.9}/month</p>
            <p>• 85% uptime → ${FIRST_SIX_CONSTANTS.MONTHLY_CAP_USD * 0.85}/month</p>
            <p>• <strong>Below 80% uptime → $0 (floor)</strong> — unearned funds revert to treasury</p>
          </div>
        </div>

        <div>
          <p className="font-semibold text-ink-900 mb-2">💰 Program Cap</p>
          <p className="text-sm text-ink-700">
            ${FIRST_SIX_CONSTANTS.SEAT_CAP_USD} per seat × {FIRST_SIX_CONSTANTS.SEAT_COUNT} seats
            = ${FIRST_SIX_CONSTANTS.PROGRAM_CAP_USD} total program cap.
            Each operator runs for {FIRST_SIX_CONSTANTS.WINDOW_COUNT} months maximum.
          </p>
        </div>

        <div>
          <p className="font-semibold text-ink-900 mb-2">🔍 Measurement (v1: Probe-Attested)</p>
          <p className="text-sm text-ink-700">
            Uptime is measured via scheduled HTTP probes to your node endpoint. This is
            labeled openly as <strong>"probe-attested"</strong> — NOT consensus-native.
            Future sensor swap to consensus-verified is planned (OracleAdapter seam).
          </p>
        </div>

        <div>
          <p className="font-semibold text-ink-900 mb-2">🚪 Exit Anytime</p>
          <p className="text-sm text-ink-700">
            Voluntary exit stops earning immediately. Unearned remainder returns to treasury.
            Your seat recycles into the drip as a new opening on the next 30-day tick.
          </p>
        </div>
      </div>
    </section>
  );
}
