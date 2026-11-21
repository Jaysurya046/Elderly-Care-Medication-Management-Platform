import { describe, it, expect } from 'vitest';
import { decrementStock, isLowStock, calculateDaysOfSupply } from '../stock';

describe('Stock Inventory Logic (packages/core)', () => {
  it('decrements stock count accurately', () => {
    expect(decrementStock(10, 1)).toBe(9);
    expect(decrementStock(5, 2)).toBe(3);
  });

  it('enforces the zero-floor invariant (never drops below 0)', () => {
    expect(decrementStock(0, 1)).toBe(0);
    expect(decrementStock(1, 5)).toBe(0);
  });

  it('rejects negative quantity decrements', () => {
    expect(() => decrementStock(10, -1)).toThrow('Quantity to decrement must be non-negative.');
  });

  it('detects low stock threshold accurately', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(3, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });

  it('calculates days of supply remaining correctly', () => {
    expect(calculateDaysOfSupply(28, 2)).toBe(14);
    expect(calculateDaysOfSupply(29, 2)).toBe(14);
    expect(calculateDaysOfSupply(0, 2)).toBe(0);
    expect(calculateDaysOfSupply(10, 0)).toBe(Infinity);
  });
});
