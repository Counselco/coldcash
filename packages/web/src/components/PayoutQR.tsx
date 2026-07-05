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
    <div style={{
      marginTop: '2rem',
      padding: '1.5rem',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      border: '2px solid #e5e7eb'
    }}>
      <h3 style={{ marginTop: 0, color: '#111827' }}>
        💰 Scan to Pay from Your ChronX Wallet
      </h3>

      <div style={{
        display: 'flex',
        gap: '2rem',
        alignItems: 'flex-start',
        flexWrap: 'wrap'
      }}>
        <div style={{
          padding: '1rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <QRCodeSVG
            value={payUri}
            size={200}
            level="M"
            includeMargin={true}
          />
        </div>

        <div style={{ flex: 1, minWidth: '280px' }}>
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
              <strong>To:</strong> <code style={{ fontSize: '0.85rem' }}>{granteeAddress}</code>
            </p>
            <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
              <strong>Amount:</strong> {payoutKx} KX
            </p>
            <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
              <strong>Memo:</strong> <code>{grantId}:{resolutionHashPrefix}</code>
            </p>
            <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
              <strong>Ref:</strong> {grantId}
            </p>
          </div>

          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: '#fef3c7',
            borderRadius: '6px',
            border: '1px solid #fbbf24'
          }}>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#92400e' }}>
              <strong>Deep Link URI (tap to copy):</strong>
            </p>
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              <code style={{
                flex: 1,
                fontSize: '0.75rem',
                wordBreak: 'break-all',
                padding: '0.5rem',
                backgroundColor: 'white',
                borderRadius: '4px',
                border: '1px solid #d97706'
              }}>
                {payUri}
              </code>
              <button
                onClick={handleCopy}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  backgroundColor: copied ? '#10b981' : '#0070f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p style={{
        marginTop: '1rem',
        marginBottom: 0,
        fontSize: '0.85rem',
        color: '#6b7280',
        fontStyle: 'italic'
      }}>
        Scan this QR code with your ChronX wallet to pre-fill the Send form.
        Review and sign on your device.
      </p>
    </div>
  );
}
