/**
 * Pure functions for medication inventory and stock management.
 */

/**
 * Decrements stock count ensuring stock never drops below zero (zero-floor invariant).
 */
export function decrementStock(currentStock: number, quantity: number = 1): number {
  if (quantity < 0) {
    throw new Error('Quantity to decrement must be non-negative.');
  }
  return Math.max(0, currentStock - quantity);
}

/**
 * Checks whether current inventory has breached the refill threshold.
 */
export function isLowStock(stockCount: number, refillThreshold: number): boolean {
  return stockCount <= refillThreshold;
}

/**
 * Calculates estimated days of supply remaining based on daily consumption.
 */
export function calculateDaysOfSupply(stockCount: number, dailyDoseCount: number): number {
  if (dailyDoseCount <= 0) return Infinity;
  return Math.floor(stockCount / dailyDoseCount);
}
