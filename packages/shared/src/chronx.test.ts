import { describe, it, expect } from 'vitest';
import { buildChronxPayUri } from './chronx.js';

describe('buildChronxPayUri', () => {
  it('builds basic pay URI with required fields', () => {
    const uri = buildChronxPayUri({
      to: '0x1234567890abcdef',
      amount: '1000',
    });

    expect(uri).toBe('chronx://pay?to=0x1234567890abcdef&amount=1000');
  });

  it('includes memo when provided', () => {
    const uri = buildChronxPayUri({
      to: '0x1234567890abcdef',
      amount: '1000',
      memo: 'coldcash-g0001:0xa41ba9ff',
    });

    expect(uri).toBe('chronx://pay?to=0x1234567890abcdef&amount=1000&memo=coldcash-g0001%3A0xa41ba9ff');
  });

  it('includes ref when provided', () => {
    const uri = buildChronxPayUri({
      to: '0x1234567890abcdef',
      amount: '1000',
      ref: 'coldcash-g0001',
    });

    expect(uri).toBe('chronx://pay?to=0x1234567890abcdef&amount=1000&ref=coldcash-g0001');
  });

  it('includes all fields when provided', () => {
    const uri = buildChronxPayUri({
      to: '0x1234567890abcdef',
      amount: '1000',
      memo: 'coldcash-g0001:0xa41ba9ff',
      ref: 'coldcash-g0001',
    });

    expect(uri).toBe('chronx://pay?to=0x1234567890abcdef&amount=1000&memo=coldcash-g0001%3A0xa41ba9ff&ref=coldcash-g0001');
  });

  it('URL-encodes special characters in memo', () => {
    const uri = buildChronxPayUri({
      to: '0x1234567890abcdef',
      amount: '1000',
      memo: 'test memo with spaces & symbols!',
    });

    expect(uri).toContain('memo=test+memo+with+spaces+%26+symbols%21');
  });

  it('handles large KX amounts as strings', () => {
    const uri = buildChronxPayUri({
      to: '0x1234567890abcdef',
      amount: '50000',
    });

    expect(uri).toBe('chronx://pay?to=0x1234567890abcdef&amount=50000');
  });
});
