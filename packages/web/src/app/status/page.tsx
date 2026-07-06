'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PayoutQR } from '@/components/PayoutQR';

interface ResolutionData {
  grant_id: string;
  resolution: {
    grant_id: string;
    payload_hash: string;
    window: number;
    metric_value: number;
    evidence_hash: string;
    payout_kx: string;
    settlement_ref: string | null;
    resolved_at: string;
  };
  grantee_seat: string;
  grantor_seat: string;
  pool_kx: string;
}

function StatusPageContent() {
  const searchParams = useSearchParams();
  const queryGrantId = searchParams.get('grant');
  const [grantId, setGrantId] = useState(queryGrantId || '');
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState<ResolutionData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (queryGrantId) {
      handleLoad();
    }
  }, [queryGrantId]);

  const handleLoad = async () => {
    setLoading(true);
    setError('');
    try {
      // For g0001, use embedded data (inaugural grant)
      if (grantId === 'coldcash-g0001') {
        const g0001Data: ResolutionData = {
          grant_id: "coldcash-g0001",
          resolution: {
            grant_id: "coldcash-g0001",
            payload_hash: "0xf5971717a4e12c67efddd69bf043b12169f964b3126906e3fa86717dfb061cea",
            window: 1,
            metric_value: 1,
            evidence_hash: "0x813bba1e31e4e1db333fe1c258926a1fc73deb6c4b282ae82835f9e9f1413664",
            payout_kx: "1000",
            settlement_ref: null,
            resolved_at: "2026-07-05T11:39:56.948Z"
          },
          grantee_seat: "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ",
          grantor_seat: "dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ",
          pool_kx: "50000"
        };
        setResolution(g0001Data);
        setLoading(false);
        return;
      }

      // For other grants, fetch from server
      const response = await fetch(`/data/${grantId}-payout.json`);
      if (!response.ok) {
        throw new Error(`Grant ${grantId} not found`);
      }
      const data = await response.json();
      setResolution(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold text-ink-900 mb-3">
          Resolution Status
        </h1>
        <p className="text-lg text-ink-700">
          Check the status of resolved promises and view payout details.
        </p>
      </div>

      {!queryGrantId && !resolution && !loading && (
        <div className="mb-8 bg-gradient-to-br from-success-50 to-amber-50 rounded-warm-lg shadow-warm p-8 border border-success-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-success-500 rounded-warm flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">✓</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-success-900 mb-2 text-lg">
                Latest Resolved Grant
              </p>
              <p className="text-ink-900 mb-1">
                <span className="font-mono font-semibold">coldcash-g0001</span> — inaugural kept promise
              </p>
              <p className="text-ink-700 text-sm mb-4">
                First ColdCash grant resolved with ChronX consensus proof
              </p>
              <a
                href="/status?grant=coldcash-g0001"
                className="inline-block px-6 py-2.5 bg-success-500 text-white font-medium rounded-warm hover:bg-success-600 transition-colors"
              >
                View Payout →
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
        <label className="block text-ink-900 font-semibold mb-2">
          Grant ID
        </label>
        <p className="text-sm text-ink-600 mb-4">
          Enter a grant ID to view its resolution status and payout details.
        </p>
        <input
          type="text"
          value={grantId}
          onChange={(e) => setGrantId(e.target.value)}
          placeholder="coldcash-g0001"
          className="w-full px-4 py-3 border border-cream-300 rounded-warm focus:outline-none focus:ring-2 focus:ring-warmAccent-500 focus:border-transparent text-ink-900 placeholder-ink-400 font-mono"
        />
        <button
          onClick={handleLoad}
          disabled={loading || !grantId}
          className="mt-4 w-full px-6 py-3 bg-warmAccent-500 text-white font-medium rounded-warm hover:bg-warmAccent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Load Resolution'}
        </button>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-warm text-red-800">
          {error}
        </div>
      )}

      {resolution && (
        <div className="mt-8 space-y-6">
          <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
            <h3 className="font-display text-2xl font-semibold text-ink-900 mb-6">
              Resolution Record
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Grant ID</p>
                <p className="text-ink-900 font-mono">{resolution.grant_id}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Payout</p>
                <p className="text-ink-900 font-semibold text-lg">{resolution.resolution.payout_kx} KX</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Window</p>
                <p className="text-ink-900">{resolution.resolution.window}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Metric Value</p>
                <p className="text-ink-900">{resolution.resolution.metric_value}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-semibold text-ink-700 mb-1">Resolved At</p>
                <p className="text-ink-900">{new Date(resolution.resolution.resolved_at).toLocaleString()}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-semibold text-ink-700 mb-1">Evidence Hash</p>
                <code className="text-xs text-ink-600 bg-cream-200 px-2 py-1 rounded break-all block">
                  {resolution.resolution.evidence_hash}
                </code>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-semibold text-ink-700 mb-1">Payload Hash</p>
                <code className="text-xs text-ink-600 bg-cream-200 px-2 py-1 rounded break-all block">
                  {resolution.resolution.payload_hash}
                </code>
              </div>
            </div>
          </div>

          {parseFloat(resolution.resolution.payout_kx) > 0 && (
            <PayoutQR
              grantId={resolution.grant_id}
              granteeAddress={resolution.grantee_seat}
              payoutKx={resolution.resolution.payout_kx}
              resolutionHashPrefix={resolution.resolution.payload_hash.slice(0, 10)}
            />
          )}

          {parseFloat(resolution.resolution.payout_kx) === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-warm">
              <p className="text-amber-900 font-semibold">
                ⚠️ Zero payout - no settlement action required
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={
      <div className="max-w-4xl mx-auto">
        <h2 className="font-display text-3xl font-semibold text-ink-900">Loading...</h2>
      </div>
    }>
      <StatusPageContent />
    </Suspense>
  );
}
