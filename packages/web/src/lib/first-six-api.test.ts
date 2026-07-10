import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FirstSixApiClient, getApiMode, FIRST_SIX_CONSTANTS } from './first-six-api';
import { FIRST_SIX_GRANTOR } from '@coldcash/shared';

describe('FirstSixApiClient', () => {
  describe('PRE_LAUNCH mode', () => {
    let client: FirstSixApiClient;

    beforeEach(() => {
      client = new FirstSixApiClient('PRE_LAUNCH');
    });

    it('returns honest empty state for vault (no fake data)', async () => {
      const vault = await client.getVaultState();

      expect(vault.grantorAddress).toBe(FIRST_SIX_GRANTOR);
      expect(vault.totalLocked).toBeNull(); // NOT "0" or "1000000"
      expect(vault.armedGrantCount).toBeNull(); // NOT 0
      expect(vault.totalDisbursed).toBeNull(); // NOT "0"
    });

    it('returns honest empty state for seats (no fake data)', async () => {
      const seats = await client.getSeatsState();

      expect(seats.total).toBe(6);
      expect(seats.openNow).toBeNull(); // NOT 0 or 1
      expect(seats.claimed).toBeNull(); // NOT 0
      expect(seats.nextSeatOpensAt).toBeNull(); // NOT a fake timestamp
    });

    it('returns honest empty state for operator dashboard', async () => {
      const dashboard = await client.getOperatorDashboard(FIRST_SIX_GRANTOR);

      expect(dashboard).not.toBeNull();
      expect(dashboard?.operatorAddress).toBe(FIRST_SIX_GRANTOR);
      expect(dashboard?.seatNumber).toBeNull(); // NOT 1
      expect(dashboard?.grantId).toBeNull(); // NOT "g0001" or fake ID
      expect(dashboard?.currentWindow).toBeNull(); // NOT 1
      expect(dashboard?.windows).toEqual([]); // NOT fake window data
      expect(dashboard?.totalEarned).toBeNull(); // NOT "0" or fake amount
    });

    it('returns null for valve state (no valve in pre-launch)', async () => {
      const valve = await client.getValveState();
      expect(valve).toBeNull();
    });
  });

  describe('LIVE mode', () => {
    let client: FirstSixApiClient;

    beforeEach(() => {
      client = new FirstSixApiClient('LIVE');
      global.fetch = vi.fn();
    });

    it('fetches vault state from API', async () => {
      const mockResponse = {
        grantorAddress: FIRST_SIX_GRANTOR,
        totalLocked: '50000',
        armedGrantCount: 2,
        totalDisbursed: '100',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const vault = await client.getVaultState();
      expect(vault).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('https://api.uponproof.com/first-six/vault');
    });

    it('fetches seats state from API', async () => {
      const mockResponse = {
        openNow: 1,
        claimed: 2,
        total: 6,
        nextSeatOpensAt: '2026-08-10T00:00:00.000Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const seats = await client.getSeatsState();
      expect(seats).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('https://api.uponproof.com/first-six/seats');
    });
  });

  describe('constants', () => {
    it('exports correct program constants', () => {
      expect(FIRST_SIX_CONSTANTS.GRANTOR).toBe('dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ');
      expect(FIRST_SIX_CONSTANTS.SEAT_COUNT).toBe(6);
      expect(FIRST_SIX_CONSTANTS.MONTHLY_CAP_USD).toBe(20);
      expect(FIRST_SIX_CONSTANTS.WINDOW_COUNT).toBe(5);
      expect(FIRST_SIX_CONSTANTS.SEAT_CAP_USD).toBe(100);
      expect(FIRST_SIX_CONSTANTS.PROGRAM_CAP_USD).toBe(600);
      expect(FIRST_SIX_CONSTANTS.UPTIME_FLOOR).toBe(80);
    });
  });
});
