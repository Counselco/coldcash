import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FirstSixVault } from './FirstSixVault';
import * as firstSixApi from '@/lib/first-six-api';

vi.mock('@/lib/first-six-api', () => ({
  firstSixApi: {
    getMode: vi.fn(),
    getVaultState: vi.fn(),
  },
  FIRST_SIX_CONSTANTS: {
    GRANTOR: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
    SEAT_COUNT: 6,
  },
}));

describe('FirstSixVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pre-launch state with honest empty values', async () => {
    (firstSixApi.firstSixApi.getMode as any).mockReturnValue('PRE_LAUNCH');
    (firstSixApi.firstSixApi.getVaultState as any).mockResolvedValue({
      grantorAddress: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      totalLocked: null,
      armedGrantCount: null,
      totalDisbursed: null,
    });

    render(<FirstSixVault />);

    await waitFor(() => {
      expect(screen.getByText(/Preview — Program not yet launched/i)).toBeInTheDocument();
    });

    // Honest empty states — NO fake values
    expect(screen.getByText(/Not yet armed/i)).toBeInTheDocument();
    expect(screen.getByText(/TBD/i)).toBeInTheDocument();
  });

  it('never renders placeholder addresses (0x000... or fake hashes)', async () => {
    (firstSixApi.firstSixApi.getMode as any).mockReturnValue('PRE_LAUNCH');
    (firstSixApi.firstSixApi.getVaultState as any).mockResolvedValue({
      grantorAddress: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      totalLocked: null,
      armedGrantCount: null,
      totalDisbursed: null,
    });

    const { container } = render(<FirstSixVault />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText(/Preview — Program not yet launched/i)).toBeInTheDocument();
    });

    const html = container.innerHTML;

    // BANNED: No 0x000... style placeholders
    expect(html).not.toContain('0x000');
    expect(html).not.toContain('0x0000000000000000000000000000000000000000');

    // ONLY the real grantor address should appear
    expect(html).toContain('dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ');
  });

  it('renders live state with real data', async () => {
    (firstSixApi.firstSixApi.getMode as any).mockReturnValue('LIVE');
    (firstSixApi.firstSixApi.getVaultState as any).mockResolvedValue({
      grantorAddress: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      totalLocked: '50000',
      armedGrantCount: 2,
      totalDisbursed: '100',
    });

    render(<FirstSixVault />);

    await waitFor(() => {
      expect(screen.getByText(/50000 KX/i)).toBeInTheDocument();
      expect(screen.getByText(/2 \/ 6/i)).toBeInTheDocument();
      expect(screen.getByText(/100 KX/i)).toBeInTheDocument();
    });

    // Should NOT show pre-launch banner in LIVE mode
    expect(screen.queryByText(/Preview — Program not yet launched/i)).not.toBeInTheDocument();
  });
});
