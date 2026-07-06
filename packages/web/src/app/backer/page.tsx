'use client';

import { useState } from 'react';
import type { IntakeResponse } from '@/lib/api';

export default function BackerPage() {
  const [wish, setWish] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState('');

  const handleIntake = async () => {
    setLoading(true);
    setError('');
    try {
      // In real impl, this would call /intake API
      // For demo, simulate response
      const mockResult: IntakeResponse = {
        frozen: {
          goal: wish,
          success_criteria: `Complete: ${wish}`,
          evidence_required: 'Evidence of completion',
          standardHash: '0x' + '0'.repeat(64),
        },
        kind: 'manual-attestation',
        isSubjective: false,
        requiresConsent: false,
        spec: { kind: 'manual-attestation', goal: wish },
      };
      setResult(mockResult);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFund = async () => {
    setLoading(true);
    setError('');
    try {
      // In real impl: approve USDC + createPromise
      // For demo, show success
      alert('Promise created! (demo mode - no tx sent)');
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
          Back a Goal
        </h1>
        <p className="text-lg text-ink-700">
          Fund someone's ambition with a clear promise. They deliver, you release the reward.
        </p>
      </div>

      <div className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
        <label className="block text-ink-900 font-semibold mb-2">
          What do you want to incentivize?
        </label>
        <p className="text-sm text-ink-600 mb-4">
          Describe the goal clearly. Be specific about what success looks like.
        </p>
        <textarea
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="e.g., merge PR #42 in org/repo by 1735689600"
          className="w-full min-h-[120px] px-4 py-3 border border-cream-300 rounded-warm focus:outline-none focus:ring-2 focus:ring-warmAccent-500 focus:border-transparent text-ink-900 placeholder-ink-400 resize-none"
        />
        <button
          onClick={handleIntake}
          disabled={loading || !wish}
          className="mt-4 w-full px-6 py-3 bg-warmAccent-500 text-white font-medium rounded-warm hover:bg-warmAccent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Review Standard'}
        </button>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-warm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
          <h3 className="font-display text-2xl font-semibold text-ink-900 mb-6">
            Frozen Standard (Review)
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-ink-700 mb-1">Goal</p>
              <p className="text-ink-900">{result.frozen.goal}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-700 mb-1">Success Criteria</p>
              <p className="text-ink-900">{result.frozen.success_criteria}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-700 mb-1">Evidence Required</p>
              <p className="text-ink-900">{result.frozen.evidence_required}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-700 mb-1">Standard Hash</p>
              <code className="text-xs text-ink-600 bg-cream-200 px-2 py-1 rounded break-all block">
                {result.frozen.standardHash}
              </code>
            </div>
          </div>

          {result.requiresConsent && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-300 rounded-warm">
              <p className="text-amber-900 font-semibold">
                ⚠️ This goal is subjective and requires explicit consent
              </p>
            </div>
          )}

          <button
            onClick={handleFund}
            disabled={loading || result.requiresConsent}
            className="mt-6 w-full px-6 py-3 bg-success-500 text-white font-medium rounded-warm hover:bg-success-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            One-Tap Fund (Approve + Create)
          </button>
          <p className="text-sm text-ink-600 mt-3 text-center">
            ⚡ Funding is one-tap; releasing is never one-tap (deliberate friction)
          </p>
        </div>
      )}
    </div>
  );
}
