#!/usr/bin/env tsx
/**
 * Pre-build validation: ensure payout addresses are real ChronX base58 addresses,
 * not placeholders or burn addresses.
 *
 * Prevents shipping a QR that would send funds to an unrecoverable address.
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE58_CHARSET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MIN_ADDRESS_LENGTH = 32;
const MAX_ADDRESS_LENGTH = 44;

interface PayoutData {
  grant_id: string;
  grantee_seat: string;
  grantor_seat: string;
}

function isValidBase58(str: string): boolean {
  if (!str || str.length < MIN_ADDRESS_LENGTH || str.length > MAX_ADDRESS_LENGTH) {
    return false;
  }
  return [...str].every(char => BASE58_CHARSET.includes(char));
}

function isPlaceholderOrBurnAddress(address: string): boolean {
  // Reject EVM zero address
  if (address === '0x0000000000000000000000000000000000000000') {
    return true;
  }
  // Reject any 0x-prefixed address (EVM format)
  if (address.startsWith('0x')) {
    return true;
  }
  // Reject empty/missing
  if (!address || address.trim() === '') {
    return true;
  }
  return false;
}

function validatePayoutFile(filePath: string): void {
  console.log(`[validate-payout-addresses] Checking ${filePath}...`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Payout file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const data: PayoutData = JSON.parse(content);

  // Validate grantee_seat (recipient)
  if (isPlaceholderOrBurnAddress(data.grantee_seat)) {
    throw new Error(
      `INVALID grantee_seat in ${filePath}: "${data.grantee_seat}"\n` +
      `Cannot ship a payout QR with a placeholder or burn address.\n` +
      `Expected a valid ChronX base58 address (e.g., dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ).`
    );
  }

  if (!isValidBase58(data.grantee_seat)) {
    throw new Error(
      `INVALID grantee_seat in ${filePath}: "${data.grantee_seat}"\n` +
      `Not a valid base58 ChronX address. Must be ${MIN_ADDRESS_LENGTH}-${MAX_ADDRESS_LENGTH} chars, base58 charset only.`
    );
  }

  // Validate grantor_seat
  if (isPlaceholderOrBurnAddress(data.grantor_seat)) {
    throw new Error(
      `INVALID grantor_seat in ${filePath}: "${data.grantor_seat}"\n` +
      `Cannot ship with a placeholder or burn address.`
    );
  }

  if (!isValidBase58(data.grantor_seat)) {
    throw new Error(
      `INVALID grantor_seat in ${filePath}: "${data.grantor_seat}"\n` +
      `Not a valid base58 ChronX address.`
    );
  }

  console.log(`[validate-payout-addresses] ✓ ${data.grant_id} addresses are valid`);
  console.log(`  grantee_seat: ${data.grantee_seat}`);
  console.log(`  grantor_seat: ${data.grantor_seat}`);
}

// Main
const payoutFilePath = path.join(__dirname, '../public/data/g0001-payout.json');
validatePayoutFile(payoutFilePath);

console.log('[validate-payout-addresses] All payout addresses validated successfully.');
