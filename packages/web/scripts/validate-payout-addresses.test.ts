import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SCRIPT_PATH = path.join(__dirname, 'validate-payout-addresses.ts');
const TEMP_PAYOUT_DIR = path.join(__dirname, '../public/data');
const TEMP_PAYOUT_PATH = path.join(TEMP_PAYOUT_DIR, 'test-payout.json');

function runValidation(payoutData: any): { success: boolean; output: string } {
  // Create temp file
  fs.mkdirSync(TEMP_PAYOUT_DIR, { recursive: true });
  fs.writeFileSync(TEMP_PAYOUT_PATH, JSON.stringify(payoutData, null, 2));

  // Modify script to use temp file
  const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf-8');
  const modifiedScript = scriptContent.replace(
    'g0001-payout.json',
    'test-payout.json'
  );
  const tempScriptPath = path.join(__dirname, 'validate-payout-addresses.tmp.ts');
  fs.writeFileSync(tempScriptPath, modifiedScript);

  try {
    const output = execSync(`npx tsx ${tempScriptPath}`, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
    });
    fs.unlinkSync(tempScriptPath);
    fs.unlinkSync(TEMP_PAYOUT_PATH);
    return { success: true, output };
  } catch (error: any) {
    fs.unlinkSync(tempScriptPath);
    fs.unlinkSync(TEMP_PAYOUT_PATH);
    return { success: false, output: error.stderr || error.stdout || error.message };
  }
}

describe('validate-payout-addresses', () => {
  it('accepts valid base58 ChronX addresses', () => {
    const result = runValidation({
      grant_id: 'test-g0001',
      grantee_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      grantor_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      pool_kx: '50000',
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain('validated successfully');
  });

  it('rejects EVM zero address', () => {
    const result = runValidation({
      grant_id: 'test-g0001',
      grantee_seat: '0x0000000000000000000000000000000000000000',
      grantor_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      pool_kx: '50000',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('INVALID grantee_seat');
    expect(result.output).toContain('placeholder or burn address');
  });

  it('rejects any 0x-prefixed address', () => {
    const result = runValidation({
      grant_id: 'test-g0001',
      grantee_seat: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      grantor_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      pool_kx: '50000',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('INVALID grantee_seat');
  });

  it('rejects empty grantee_seat', () => {
    const result = runValidation({
      grant_id: 'test-g0001',
      grantee_seat: '',
      grantor_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      pool_kx: '50000',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('INVALID grantee_seat');
  });

  it('rejects non-base58 characters', () => {
    const result = runValidation({
      grant_id: 'test-g0001',
      grantee_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ0',  // '0' is valid base58
      grantor_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      pool_kx: '50000',
    });
    // This should actually pass because '0' is not in base58, wait let me check...
    // BASE58_CHARSET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    // '0' (zero) is NOT in base58! Good.
    expect(result.success).toBe(false);
    expect(result.output).toContain('Not a valid base58');
  });

  it('rejects addresses that are too short', () => {
    const result = runValidation({
      grant_id: 'test-g0001',
      grantee_seat: 'shortaddr',  // Too short
      grantor_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      pool_kx: '50000',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Not a valid base58');
  });

  it('validates both grantee_seat and grantor_seat', () => {
    const result = runValidation({
      grant_id: 'test-g0001',
      grantee_seat: 'dD8XBABN2nu66tnL25XYGXATYTNdgQQjLhf2VZtuLeZ',
      grantor_seat: '0x0000000000000000000000000000000000000000',
      pool_kx: '50000',
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('INVALID grantor_seat');
  });
});
