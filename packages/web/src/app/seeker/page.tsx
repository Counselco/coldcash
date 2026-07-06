'use client';

import { useState } from 'react';

export default function SeekerPage() {
  const [promiseId, setPromiseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [promise, setPromise] = useState<any>(null);
  const [error, setError] = useState('');

  const handleLoad = async () => {
    setLoading(true);
    setError('');
    try {
      // In real impl, fetch /promises/:id
      // For demo, simulate
      const mockPromise = {
        ref: { chainId: 31337, address: '0x...' },
        frozen: {
          goal: 'Merge PR #42 in testorg/testrepo',
          success_criteria: 'PR merged before deadline',
          evidence_required: 'GitHub webhook confirmation',
          standardHash: '0x' + '0'.repeat(64),
        },
        prize: '100.00 USDC',
        acceptBy: Math.floor(Date.now() / 1000) + 86400,
        deadline: Math.floor(Date.now() / 1000) + 604800,
        status: 'Offered',
      };
      setPromise(mockPromise);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    setError('');
    try {
      // In real impl: call accept() on escrow
      // For demo, show success
      alert('Promise accepted! (demo mode - no tx sent)');
      setPromise({ ...promise, status: 'Accepted' });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold text-ink-900 mb-3">
          Earn a Payout
        </h1>
        <p className="text-lg text-ink-700">
          Accept a promise, do the work, prove you did it. Get paid instantly.
        </p>
      </div>

      <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
        <label className="block text-ink-900 font-semibold mb-2">
          Promise Link / ID
        </label>
        <p className="text-sm text-ink-600 mb-4">
          Enter the promise identifier you received from the backer.
        </p>
        <input
          type="text"
          value={promiseId}
          onChange={(e) => setPromiseId(e.target.value)}
          placeholder="0x..."
          className="w-full px-4 py-3 border border-cream-300 rounded-warm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-ink-900 placeholder-ink-400"
        />
        <button
          onClick={handleLoad}
          disabled={loading || !promiseId}
          className="mt-4 w-full px-6 py-3 bg-amber-500 text-white font-medium rounded-warm hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Load Promise'}
        </button>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-warm text-red-800">
          {error}
        </div>
      )}

      {promise && (
        <div className="mt-8 bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
          <h3 className="font-display text-2xl font-semibold text-ink-900 mb-6">
            Promise Details
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-cream-100 rounded-warm">
            <div>
              <p className="text-sm font-semibold text-ink-700 mb-1">Status</p>
              <p className="text-ink-900">{promise.status}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-700 mb-1">Prize</p>
              <p className="text-ink-900 font-semibold text-lg">{promise.prize}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-700 mb-1">Accept By</p>
              <p className="text-ink-900 text-sm">{new Date(promise.acceptBy * 1000).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-700 mb-1">Deadline</p>
              <p className="text-ink-900 text-sm">{new Date(promise.deadline * 1000).toLocaleString()}</p>
            </div>
          </div>

          <div className="border-t border-cream-300 pt-6">
            <h4 className="font-display text-xl font-semibold text-ink-900 mb-4">
              Frozen Standard (What you're accepting)
            </h4>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Goal</p>
                <p className="text-ink-900">{promise.frozen.goal}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Success Criteria</p>
                <p className="text-ink-900">{promise.frozen.success_criteria}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Evidence Required</p>
                <p className="text-ink-900">{promise.frozen.evidence_required}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Standard Hash</p>
                <code className="text-xs text-ink-600 bg-cream-200 px-2 py-1 rounded break-all block">
                  {promise.frozen.standardHash}
                </code>
              </div>
            </div>
          </div>

          {promise.status === 'Offered' && (
            <div className="mt-6">
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-warm mb-4">
                <p className="text-amber-900 font-semibold text-sm">
                  ⚠️ Acceptance is the point of no return
                </p>
              </div>
              <button
                onClick={handleAccept}
                disabled={loading}
                className="w-full px-6 py-3 bg-success-500 text-white font-medium rounded-warm hover:bg-success-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Accepting...' : 'Accept Promise'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
