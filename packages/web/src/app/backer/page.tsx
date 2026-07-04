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
    <main>
      <h2>Backer Flow: Create Promise</h2>
      <div style={{ marginTop: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          What do you want to incentivize?
        </label>
        <textarea
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="e.g., merge PR #42 in org/repo by 1735689600"
          style={{
            width: '100%',
            minHeight: '100px',
            padding: '0.5rem',
            fontSize: '1rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}
        />
        <button
          onClick={handleIntake}
          disabled={loading || !wish}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !wish ? 0.6 : 1,
          }}
        >
          {loading ? 'Processing...' : 'Review Standard'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fee', borderRadius: '4px', color: '#c00' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <h3>Frozen Standard (Review)</h3>
          <p><strong>Goal:</strong> {result.frozen.goal}</p>
          <p><strong>Success Criteria:</strong> {result.frozen.success_criteria}</p>
          <p><strong>Evidence Required:</strong> {result.frozen.evidence_required}</p>
          <p><strong>Standard Hash:</strong> <code>{result.frozen.standardHash}</code></p>

          {result.requiresConsent && (
            <p style={{ color: '#c00', fontWeight: 'bold' }}>⚠️ This goal is subjective and requires explicit consent</p>
          )}

          <button
            onClick={handleFund}
            disabled={loading || result.requiresConsent}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              backgroundColor: '#00c800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || result.requiresConsent ? 'not-allowed' : 'pointer',
              opacity: loading || result.requiresConsent ? 0.6 : 1,
            }}
          >
            One-Tap Fund (Approve + Create)
          </button>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
            ⚡ Funding is one-tap; releasing is never one-tap (deliberate friction)
          </p>
        </div>
      )}
    </main>
  );
}
