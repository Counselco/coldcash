import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { XChanCashOut } from './XChanCashOut';
import { XChanClient } from '@coldcash/shared';

vi.mock('@coldcash/shared', () => ({
  XChanClient: vi.fn(),
}));

describe('XChanCashOut', () => {
  const originalEnv = process.env;
  const mockQuoteKxToUsdc = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    mockQuoteKxToUsdc.mockReset();
    (XChanClient as any).mockImplementation(() => ({
      quoteKxToUsdc: mockQuoteKxToUsdc,
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('when NEXT_PUBLIC_XCHAN_URL is not set', () => {
    it('renders nothing in production mode', () => {
      process.env.NEXT_PUBLIC_XCHAN_URL = '';
      process.env.NODE_ENV = 'production';

      const { container } = render(<XChanCashOut />);
      expect(container.firstChild).toBeNull();
    });

    it('renders operator note in development mode', () => {
      process.env.NEXT_PUBLIC_XCHAN_URL = '';
      process.env.NODE_ENV = 'development';

      render(<XChanCashOut />);
      expect(screen.getByText(/XChan link inactive — set NEXT_PUBLIC_XCHAN_URL/i)).toBeInTheDocument();
    });
  });

  describe('when NEXT_PUBLIC_XCHAN_URL is set', () => {
    const testUrl = 'https://xchan.example.com';

    beforeEach(() => {
      process.env.NEXT_PUBLIC_XCHAN_URL = testUrl;
    });

    it('renders the cash-out section', () => {
      render(<XChanCashOut />);
      expect(screen.getByText(/Cash out KX → USDC via XChan/i)).toBeInTheDocument();
    });

    it('shows Base network warning in copy', () => {
      render(<XChanCashOut />);
      expect(screen.getByText(/on the Base network/i)).toBeInTheDocument();
      expect(screen.getByText(/USDC from XChan arrives on Base/i)).toBeInTheDocument();
      expect(screen.getByText(/ColdCash escrow payouts use Arbitrum/i)).toBeInTheDocument();
      expect(screen.getByText(/always match your wallet's network to the payout source/i)).toBeInTheDocument();
    });

    it('displays external service warning', () => {
      render(<XChanCashOut />);
      expect(screen.getByText(/You are leaving ColdCash — XChan is a separate service/i)).toBeInTheDocument();
    });

    it('renders link with correct href', () => {
      render(<XChanCashOut />);
      const link = screen.getByRole('link', { name: /Go to XChan/i });
      expect(link).toHaveAttribute('href', testUrl);
    });

    it('opens link in new tab with security attributes', () => {
      render(<XChanCashOut />);
      const link = screen.getByRole('link', { name: /Go to XChan/i });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('displays destination domain', () => {
      render(<XChanCashOut />);
      expect(screen.getByText('xchan.example.com')).toBeInTheDocument();
    });
  });

  describe('with production xchan.io URL', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_XCHAN_URL = 'https://xchan.io';
    });

    it('renders domain as xchan.io', () => {
      render(<XChanCashOut />);
      expect(screen.getByText('xchan.io')).toBeInTheDocument();
    });

    it('renders Base network warning when active', () => {
      render(<XChanCashOut />);
      expect(screen.getByText(/on the Base network/i)).toBeInTheDocument();
    });

    it('rejects non-https URLs', () => {
      process.env.NEXT_PUBLIC_XCHAN_URL = 'http://xchan.example.com';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { container } = render(<XChanCashOut />);
      expect(container.firstChild).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('NEXT_PUBLIC_XCHAN_URL must be https');

      consoleSpy.mockRestore();
    });

    it('rejects invalid URLs', () => {
      process.env.NEXT_PUBLIC_XCHAN_URL = 'not-a-url';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { container } = render(<XChanCashOut />);
      expect(container.firstChild).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid NEXT_PUBLIC_XCHAN_URL:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('quote functionality', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_XCHAN_URL = 'https://xchan.io';
    });

    it('fetches and displays quote when kxAmount is provided', async () => {
      mockQuoteKxToUsdc.mockResolvedValueOnce({
        usdc: 15.5,
        rate: 0.0031,
        asOf: Date.now(),
        maxSwapUsd: 500,
        reserveStatus: 'OK',
      });

      render(<XChanCashOut kxAmount={5000} />);

      await waitFor(() => {
        expect(screen.getByText(/5,000 KX/i)).toBeInTheDocument();
        expect(screen.getByText(/≈ \$15.50 USDC/i)).toBeInTheDocument();
        expect(screen.getByText(/Rate: 1 KX = \$0.00310/i)).toBeInTheDocument();
      });
    });

    it('shows loading state while fetching quote', () => {
      mockQuoteKxToUsdc.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );

      render(<XChanCashOut kxAmount={1000} />);

      expect(screen.getByText(/Loading quote.../i)).toBeInTheDocument();
    });

    it('does not fetch quote when kxAmount is zero', () => {
      render(<XChanCashOut kxAmount={0} />);

      expect(mockQuoteKxToUsdc).not.toHaveBeenCalled();
    });

    it('does not fetch quote when kxAmount is undefined', () => {
      render(<XChanCashOut />);

      expect(mockQuoteKxToUsdc).not.toHaveBeenCalled();
    });

    it('handles quote fetch failure gracefully', async () => {
      mockQuoteKxToUsdc.mockResolvedValueOnce(null);

      render(<XChanCashOut kxAmount={1000} />);

      await waitFor(() => {
        expect(screen.queryByText(/≈ \$/i)).not.toBeInTheDocument();
      });

      // Should still show the component with link
      expect(screen.getByText(/Cash out KX → USDC via XChan/i)).toBeInTheDocument();
    });

    it('refetches quote when kxAmount changes', async () => {
      mockQuoteKxToUsdc
        .mockResolvedValueOnce({
          usdc: 10,
          rate: 0.0025,
          asOf: Date.now(),
        })
        .mockResolvedValueOnce({
          usdc: 20,
          rate: 0.0025,
          asOf: Date.now(),
        });

      const { rerender } = render(<XChanCashOut kxAmount={4000} />);

      await waitFor(() => {
        expect(screen.getByText(/≈ \$10.00 USDC/i)).toBeInTheDocument();
      });

      rerender(<XChanCashOut kxAmount={8000} />);

      await waitFor(() => {
        expect(screen.getByText(/≈ \$20.00 USDC/i)).toBeInTheDocument();
      });

      expect(mockQuoteKxToUsdc).toHaveBeenCalledTimes(2);
    });
  });
});
