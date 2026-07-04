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
    <main>
      <h2>Seeker Flow: Accept Promise</h2>
      <div style={{ marginTop: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Promise Link / ID
        </label>
        <input
          type="text"
          value={promiseId}
          onChange={(e) => setPromiseId(e.target.value)}
          placeholder="0x..."
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '1rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
          }}
        />
        <button
          onClick={handleLoad}
          disabled={loading || !promiseId}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !promiseId ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Load Promise'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fee', borderRadius: '4px', color: '#c00' }}>
          {error}
        </div>
      )}

      {promise && (
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <h3>Promise Details</h3>
          <p><strong>Status:</strong> {promise.status}</p>
          <p><strong>Prize:</strong> {promise.prize}</p>
          <p><strong>Accept By:</strong> {new Date(promise.acceptBy * 1000).toLocaleString()}</p>
          <p><strong>Deadline:</strong> {new Date(promise.deadline * 1000).toLocaleString()}</p>

          <hr style={{ margin: '1rem 0' }} />

          <h4>Frozen Standard (What you're accepting)</h4>
          <p><strong>Goal:</strong> {promise.frozen.goal}</p>
          <p><strong>Success Criteria:</strong> {promise.frozen.success_criteria}</p>
          <p><strong>Evidence Required:</strong> {promise.frozen.evidence_required}</p>
          <p><strong>Standard Hash:</strong> <code>{promise.frozen.standardHash}</code></p>

          {promise.status === 'Offered' && (
            <>
              <button
                onClick={handleAccept}
                disabled={loading}
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  backgroundColor: '#00c800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Accepting...' : 'Accept Promise'}
              </button>
              <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                ⚠️ Acceptance is the point of no return
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
