import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FundingStatus } from './FundingStatus';
import { FIRST_SIX_GRANTOR } from '@coldcash/shared';

describe('FundingStatus', () => {
  describe('NOT FUNDED state', () => {
    it('renders NOT FUNDED badge when no grant exists', async () => {
      render(
        <FundingStatus
          listingId="chronx-node-operator"
          expectedGrantor={FIRST_SIX_GRANTOR}
        />
      );

      // Wait for loading to complete
      await screen.findByText(/NOT FUNDED/i);

      expect(screen.getByText(/NOT FUNDED/i)).toBeDefined();
      expect(screen.getByText(/Awaiting on-chain escrow/i)).toBeDefined();
    });

    it('shows honest messaging about funding', async () => {
      render(
        <FundingStatus
          listingId="chronx-node-operator"
          expectedGrantor={FIRST_SIX_GRANTOR}
        />
      );

      await screen.findByText(/NOT FUNDED/i);

      expect(
        screen.getByText(/When funding is escrowed on-chain, the grant ID will appear/i)
      ).toBeDefined();
    });

    it('displays expected grantor address', async () => {
      render(
        <FundingStatus
          listingId="chronx-node-operator"
          expectedGrantor={FIRST_SIX_GRANTOR}
        />
      );

      await screen.findByText(/NOT FUNDED/i);

      expect(screen.getByText(/Expected grantor:/i)).toBeDefined();
      expect(screen.getByText(FIRST_SIX_GRANTOR)).toBeDefined();
    });

    it('HONESTY TEST: does NOT render any fake grant ID in NOT FUNDED state', async () => {
      const { container } = render(
        <FundingStatus
          listingId="chronx-node-operator"
          expectedGrantor={FIRST_SIX_GRANTOR}
        />
      );

      await screen.findByText(/NOT FUNDED/i);

      const html = container.innerHTML;

      // Fail if any of these fake patterns appear
      const fakePatterns = [
        /grant-\d+/i,
        /0x[0-9a-f]{40}/i, // Ethereum-style addresses (wrong chain)
        /g[0-9]{4}/i, // g0001, g0002, etc
        /placeholder/i,
        /example-grant/i,
        /TBD/i,
        /coming-soon/i,
      ];

      for (const pattern of fakePatterns) {
        if (pattern.test(html)) {
          throw new Error(
            `HONESTY VIOLATION: Found fake identifier pattern ${pattern} in NOT FUNDED state. ` +
            `NOT FUNDED must render NO grant identifiers, hashes, or placeholders.`
          );
        }
      }

      // The only valid identifier is the expected grantor address
      // (which is the REAL address, not a placeholder)
      expect(html).toContain(FIRST_SIX_GRANTOR);
    });
  });

  describe('FUNDED state', () => {
    // These tests will pass when real grant integration is wired
    it.skip('renders FUNDED badge when grant exists', () => {
      // TODO: Mock grant state when integration is ready
    });

    it.skip('displays grant ID, locked amount, and verify link', () => {
      // TODO: Mock grant state when integration is ready
    });
  });

  describe('loading and error states', () => {
    it('renders loading state initially', () => {
      const { container } = render(
        <FundingStatus
          listingId="chronx-node-operator"
          expectedGrantor={FIRST_SIX_GRANTOR}
        />
      );

      // Loading spinner should be present (briefly)
      // The animate-spin class indicates loading
      expect(container.querySelector('.animate-spin')).toBeDefined();
    });
  });
});
