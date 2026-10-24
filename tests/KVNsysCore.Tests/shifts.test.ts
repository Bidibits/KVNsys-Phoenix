import { checkShiftNote, variance, varianceInWords } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

describe("a shift's drawer", () => {
  it('is counted against what it should hold: short below zero, over above it, nothing until counted', () => {
    expect(variance({ expectedCash: 150000, countedCash: 148000 })).toBe(-2000);
    expect(variance({ expectedCash: 150000, countedCash: 150500 })).toBe(500);
    expect(variance({ expectedCash: 150000, countedCash: null })).toBeNull();
  });

  it('says the difference in words', () => {
    expect(varianceInWords(-2000)).toBe('₱20.00 short');
    expect(varianceInWords(500)).toBe('₱5.00 over');
    expect(varianceInWords(0)).toBe('Exact');
  });

  it('takes an optional note, tidied, and not too long', () => {
    expect(checkShiftNote('  ')).toBeNull();
    expect(checkShiftNote(' gave ₱20 change twice ')).toBe('gave ₱20 change twice');
    expect(() => checkShiftNote('x'.repeat(501))).toThrow(/at most 500 characters/);
  });
});
