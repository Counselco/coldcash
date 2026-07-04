import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { XChanCashOut } from './XChanCashOut';

describe('XChanCashOut', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
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

    it('shows both description paragraphs', () => {
      render(<XChanCashOut />);
      expect(screen.getByText(/Promises on ColdCash settle natively in KX/i)).toBeInTheDocument();
      expect(screen.getByText(/XChan converts KX to USDC/i)).toBeInTheDocument();
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
});
