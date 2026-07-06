'use client';

import { QRCodeSVG } from 'qrcode.react';
import { buildChronxPayUri, type ChronxPayUriParams } from '@coldcash/shared';
import { useState } from 'react';

interface PayoutQRProps {
  grantId: string;
  granteeAddress: string;
  payoutKx: string;
  resolutionHashPrefix: string;
}

export function PayoutQR({ grantId, granteeAddress, payoutKx, resolutionHashPrefix }: PayoutQRProps) {
  const [copied, setCopied] = useState(false);

  const paymentParams: ChronxPayUriParams = {
    to: granteeAddress,
    amount: payoutKx,
    memo: `${grantId}:${resolutionHashPrefix}`,
    ref: grantId,
  };

  const payUri = buildChronxPayUri(paymentParams);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(payUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 to-warmAccent-50 rounded-warm-lg shadow-warm-lg p-8 border-2 border-amber-200">
      <h3 className="font-display text-2xl font-semibold text-ink-900 mb-6 flex items-center gap-2">
        <span className="text-3xl">💰</span>
        Scan to Pay from Your ChronX Wallet
      </h3>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div className="bg-white p-6 rounded-warm-lg border-2 border-cream-300 shadow-warm">
          <QRCodeSVG
            value={payUri}
            size={200}
            level="M"
            includeMargin={true}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-warm p-6 border border-cream-300 mb-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">To</p>
                <code className="text-xs text-ink-900 bg-cream-200 px-2 py-1 rounded break-all block">
                  {granteeAddress}
                </code>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Amount</p>
                <p className="text-ink-900 text-xl font-semibold">{payoutKx} KX</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Memo</p>
                <code className="text-xs text-ink-900 bg-cream-200 px-2 py-1 rounded break-all block">
                  {grantId}:{resolutionHashPrefix}
                </code>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-700 mb-1">Ref</p>
                <p className="text-ink-900 font-mono text-sm">{grantId}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-warm p-4 border border-amber-300">
            <p className="text-sm font-semibold text-amber-900 mb-3">
              Deep Link URI (tap to copy)
            </p>
            <div className="flex gap-2 items-start">
              <code className="flex-1 text-xs text-ink-900 bg-cream-200 px-3 py-2 rounded break-all">
                {payUri}
              </code>
              <button
                onClick={handleCopy}
                className={`px-4 py-2 text-sm font-medium rounded-warm transition-colors whitespace-nowrap ${
                  copied
                    ? 'bg-success-500 text-white'
                    : 'bg-warmAccent-500 text-white hover:bg-warmAccent-600'
                }`}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-600 italic">
        Scan this QR code with your ChronX wallet to pre-fill the Send form.
        Review and sign on your device.
      </p>
    </div>
  );
}
