'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { firstSixApi, FIRST_SIX_CONSTANTS, type OperatorDashboard, type ApiMode, type ChronxAddress } from '@/lib/first-six-api';

function DashboardContent() {
  const searchParams = useSearchParams();
  const queryAddress = searchParams.get('address');

  const [address, setAddress] = useState(queryAddress || '');
  const [dashboard, setDashboard] = useState<OperatorDashboard | null>(null);
  const [mode, setMode] = useState<ApiMode>('PRE_LAUNCH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMode(firstSixApi.getMode());
    if (queryAddress) {
      handleLoad();
    }
  }, [queryAddress]);

  const handleLoad = async () => {
    if (!address) {
      setError('Please enter an operator address');
      return;
    }

    setLoading(true);
    setError('');
    setDashboard(null);

    try {
      const data = await firstSixApi.getOperatorDashboard(address as ChronxAddress);
      if (!data) {
        setError('Operator not found or not enrolled in the program');
      } else {
        setDashboard(data);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load operator dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold text-ink-900 mb-3">
          Operator Dashboard
        </h1>
        <p className="text-lg text-ink-700">
          View your First Six seat status, uptime tracking, and payment history.
        </p>
      </div>

      {mode === 'PRE_LAUNCH' && (
        <div className="mb-8 bg-amber-100 border border-amber-300 rounded-warm p-6">
          <p className="text-amber-900 font-semibold mb-2">
            ⚠️ Preview — Program not yet launched
          </p>
          <p className="text-amber-800 text-sm">
            Operator dashboards will be live after program launch. Enter any address to see
            the honest empty state — no fake data, no placeholder values.
          </p>
        </div>
      )}

      <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300 mb-8">
        <label className="block text-ink-900 font-semibold mb-2">
          ChronX Operator Address
        </label>
        <p className="text-sm text-ink-600 mb-4">
          Enter your ChronX address to view your dashboard (if enrolled).
        </p>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ"
          className="w-full px-4 py-3 border border-cream-300 rounded-warm focus:outline-none focus:ring-2 focus:ring-warmAccent-500 focus:border-transparent text-ink-900 placeholder-ink-400 font-mono text-sm"
        />
        <button
          onClick={handleLoad}
          disabled={loading || !address}
          className="mt-4 w-full px-6 py-3 bg-warmAccent-500 text-white font-medium rounded-warm hover:bg-warmAccent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Load Dashboard'}
        </button>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-warm text-red-800">
          {error}
        </div>
      )}

      {dashboard && (
        <div className="space-y-8">
          {/* Seat Overview */}
          <div className="bg-gradient-to-br from-success-50 to-success-100 rounded-warm-lg shadow-warm-lg p-8 border-2 border-success-300">
            <h2 className="font-display text-3xl font-semibold text-ink-900 mb-6 flex items-center gap-2">
              <span className="text-3xl">🪑</span>
              Your Seat
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white rounded-warm p-4 border border-cream-300">
                <p className="text-sm font-semibold text-ink-700 mb-1">Seat Number</p>
                {dashboard.seatNumber !== null ? (
                  <p className="text-3xl font-bold text-ink-900">{dashboard.seatNumber}</p>
                ) : (
                  <p className="text-2xl text-ink-500 italic">Not assigned</p>
                )}
              </div>
              <div className="bg-white rounded-warm p-4 border border-cream-300">
                <p className="text-sm font-semibold text-ink-700 mb-1">Grant ID</p>
                {dashboard.grantId ? (
                  <code className="text-xs text-ink-900 font-mono break-all block">{dashboard.grantId}</code>
                ) : (
                  <p className="text-sm text-ink-500 italic">No grant armed</p>
                )}
              </div>
              <div className="bg-white rounded-warm p-4 border border-cream-300">
                <p className="text-sm font-semibold text-ink-700 mb-1">Total Earned</p>
                {dashboard.totalEarned !== null ? (
                  <p className="text-3xl font-bold text-success-600">${dashboard.totalEarned}</p>
                ) : (
                  <p className="text-2xl text-ink-500 italic">$0</p>
                )}
              </div>
            </div>
          </div>

          {/* Current Window Tracking */}
          {dashboard.currentWindow !== null && (
            <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
              <h2 className="font-display text-2xl font-semibold text-ink-900 mb-6">
                Current Window (Month {dashboard.currentWindow} of {FIRST_SIX_CONSTANTS.WINDOW_COUNT})
              </h2>
              <p className="text-ink-600 italic">
                Live uptime tracking will appear here once the window is active.
                Uptime percentage updates as probes measure your node responsiveness.
              </p>
            </div>
          )}

          {/* Payment History */}
          <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
            <h2 className="font-display text-2xl font-semibold text-ink-900 mb-6">
              Payment History
            </h2>
            {dashboard.windows.length === 0 ? (
              <p className="text-ink-600 italic">
                No completed payment windows yet. Your first window will appear here once complete.
              </p>
            ) : (
              <div className="space-y-4">
                {dashboard.windows.map((window) => (
                  <div
                    key={window.window}
                    className="bg-cream-50 border border-cream-300 rounded-warm p-6"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-semibold text-ink-900 text-lg">
                          Window {window.window}
                        </p>
                        {window.startDate && window.endDate && (
                          <p className="text-sm text-ink-600">
                            {new Date(window.startDate).toLocaleDateString()} —{' '}
                            {new Date(window.endDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {window.payoutUsd !== null ? (
                          <p className="text-2xl font-bold text-success-600">
                            ${window.payoutUsd}
                          </p>
                        ) : (
                          <p className="text-xl text-ink-500 italic">$0</p>
                        )}
                        {window.payoutKx && (
                          <p className="text-sm text-ink-600">{window.payoutKx} KX</p>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm font-semibold text-ink-700 mb-1">Uptime</p>
                        {window.uptimePercent !== null ? (
                          <p className={`text-lg font-semibold ${
                            window.uptimePercent >= FIRST_SIX_CONSTANTS.UPTIME_FLOOR
                              ? 'text-success-600'
                              : 'text-red-600'
                          }`}>
                            {window.uptimePercent.toFixed(1)}%
                          </p>
                        ) : (
                          <p className="text-lg text-ink-500 italic">TBD</p>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-ink-700 mb-1">Measurement</p>
                        {window.source ? (
                          <p className="text-sm text-ink-900">{window.source}</p>
                        ) : (
                          <p className="text-sm text-ink-500 italic">N/A</p>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-ink-700 mb-1">Transaction</p>
                        {window.txId ? (
                          <a
                            href={`https://chronx.explorer/tx/${window.txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-warmAccent-600 hover:text-warmAccent-700 font-medium"
                          >
                            View TxId →
                          </a>
                        ) : (
                          <p className="text-sm text-ink-500 italic">Pending</p>
                        )}
                      </div>
                    </div>

                    {window.uptimePercent !== null &&
                     window.uptimePercent < FIRST_SIX_CONSTANTS.UPTIME_FLOOR && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-warm">
                        <p className="text-sm text-red-800">
                          ⚠️ Below {FIRST_SIX_CONSTANTS.UPTIME_FLOOR}% floor — $0 payout
                          (unearned funds reverted to treasury)
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exit Option */}
          <div className="bg-amber-50 border border-amber-300 rounded-warm p-6">
            <p className="font-semibold text-amber-900 mb-2">
              🚪 Voluntary Exit
            </p>
            <p className="text-amber-800 text-sm mb-3">
              You may exit the program at any time. Earning stops immediately, unearned
              remainder returns to treasury, and your seat recycles into the drip as a
              new opening on the next 30-day tick.
            </p>
            <button
              disabled
              className="px-6 py-2.5 bg-amber-500 text-white font-medium rounded-warm opacity-50 cursor-not-allowed"
            >
              Exit Program (Contact Support)
            </button>
          </div>
        </div>
      )}

      {!dashboard && !loading && !error && address && (
        <div className="bg-cream-100 border border-cream-300 rounded-warm p-8 text-center">
          <p className="text-ink-700">
            No operator found at this address, or you haven't claimed a seat yet.
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display text-3xl font-semibold text-ink-900">Loading...</h2>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
