import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PayoutQR } from './PayoutQR';

describe('PayoutQR', () => {
  it('renders payment details', () => {
    render(
      <PayoutQR
        grantId="coldcash-g0001"
        granteeAddress="0x1234567890abcdef"
        payoutKx="1000"
        resolutionHashPrefix="0xa41ba9ff"
      />
    );

    expect(screen.getByText(/Scan to Pay from Your ChronX Wallet/i)).toBeInTheDocument();
    expect(screen.getByText('0x1234567890abcdef')).toBeInTheDocument();
    expect(screen.getByText(/1000 KX/i)).toBeInTheDocument();
    expect(screen.getByText('coldcash-g0001:0xa41ba9ff')).toBeInTheDocument();
  });

  it('generates correct chronx:// pay URI', () => {
    render(
      <PayoutQR
        grantId="coldcash-g0001"
        granteeAddress="0x1234567890abcdef"
        payoutKx="1000"
        resolutionHashPrefix="0xa41ba9ff"
      />
    );

    const expectedUri = 'chronx://pay?to=0x1234567890abcdef&amount=1000&memo=coldcash-g0001%3A0xa41ba9ff&ref=coldcash-g0001';

    expect(screen.getByText(expectedUri)).toBeInTheDocument();
  });

  it('renders QR code element', () => {
    const { container } = render(
      <PayoutQR
        grantId="coldcash-g0001"
        granteeAddress="0x1234567890abcdef"
        payoutKx="1000"
        resolutionHashPrefix="0xa41ba9ff"
      />
    );

    const qrCode = container.querySelector('svg');
    expect(qrCode).toBeInTheDocument();
  });
});
