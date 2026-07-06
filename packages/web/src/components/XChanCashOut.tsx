'use client';

import { useState, useEffect } from 'react';
import { XChanClient } from '@coldcash/shared';

interface XChanCashOutProps {
  kxAmount?: number;
}

export function XChanCashOut({ kxAmount }: XChanCashOutProps) {
  const xchanUrl = process.env.NEXT_PUBLIC_XCHAN_URL;
  const isDev = process.env.NODE_ENV === 'development';
  const trustXchanPrice = process.env.NEXT_PUBLIC_COLDCASH_TRUST_XCHAN_PRICE === 'true';
  const [quote, setQuote] = useState<{ usdc: number; rate: number | null; asOf: number | null; hasProvenance: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!kxAmount || kxAmount <= 0) return;

    const fetchQuote = async () => {
      setLoading(true);
      try {
        const client = new XChanClient();
        const result = await client.quoteKxToUsdc(kxAmount);
        if (result) {
          setQuote({
            usdc: result.usdc,
            rate: result.rate,
            asOf: result.asOf,
            hasProvenance: result.hasProvenance
          });
        }
      } catch (error) {
        console.error('Failed to fetch XChan quote:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [kxAmount]);

  // Production: render nothing if URL not configured
  if (!xchanUrl) {
    if (isDev) {
      return (
        <div style={{ fontSize: '0.85rem', color: '#999', fontStyle: 'italic', marginTop: '1rem' }}>
          XChan link inactive — set NEXT_PUBLIC_XCHAN_URL
        </div>
      );
    }
    return null;
  }

  // Validate it's an https URL
  let url: URL;
  try {
    url = new URL(xchanUrl);
    if (url.protocol !== 'https:') {
      console.error('NEXT_PUBLIC_XCHAN_URL must be https');
      return null;
    }
  } catch (e) {
    console.error('Invalid NEXT_PUBLIC_XCHAN_URL:', e);
    return null;
  }

  const domain = url.hostname;

  return (
    <section className="bg-white rounded-warm-lg shadow-warm p-8 border border-cream-300">
      <h3 className="font-display text-2xl font-semibold text-ink-900 mb-4">
        Cash out KX → USDC via XChan
      </h3>

      {kxAmount && kxAmount > 0 && (
        <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-cream-100 rounded-warm border border-blue-200">
          <div className="text-sm text-ink-700 mb-1">
            {kxAmount.toLocaleString()} KX
          </div>
          {loading ? (
            <div className="text-xl font-semibold text-ink-500">
              Loading quote...
            </div>
          ) : quote ? (
            <>
              {trustXchanPrice && quote.hasProvenance ? (
                <>
                  <div className="text-2xl font-bold text-blue-700">
                    ≈ ${quote.usdc.toFixed(2)} USDC
                  </div>
                  <div className="text-xs text-ink-500 mt-1">
                    Rate: 1 KX = ${quote.rate!.toFixed(5)} • {new Date(quote.asOf!).toLocaleTimeString()}
                  </div>
                </>
              ) : (
                <div className="text-sm text-ink-600 italic">
                  USDC estimate pending verified rate
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      <div className="space-y-4 mb-6">
        <p className="text-ink-700 leading-relaxed">
          Promises settle natively in KX. XChan converts KX to USDC <strong>on the Base network</strong>.
        </p>

        <p className="text-ink-700 leading-relaxed">
          <strong>USDC from XChan arrives on Base. Escrow payouts use Arbitrum. These are different networks — always match your wallet's network to the payout source.</strong>
        </p>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-300 rounded-warm mb-6">
        <p className="text-amber-900 text-sm">
          ⚠️ You are leaving this site — XChan is a separate service
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <a
          href={xchanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-warmAccent-500 text-white font-medium rounded-warm hover:bg-warmAccent-600 transition-colors"
        >
          Go to XChan
        </a>
        <span className="text-sm text-ink-600">
          {domain}
        </span>
      </div>
    </section>
  );
}
