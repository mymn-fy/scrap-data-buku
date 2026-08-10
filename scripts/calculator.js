/**
 * Calculates the recommended number of copies based on price and a set of rules.
 * @param {number} price The book price.
 * @param {Array<Object>} rules An array of rule objects, e.g., [{ maxPrice: 50000, copies: 3 }].
 * @returns {number} The recommended number of copies.
 */
export function calculateCopies(price, rules) {
  if (price === null || price < 0) return 0;

  // Sort rules by maxPrice to ensure correct evaluation
  const sortedRules = [...rules].sort((a, b) => a.maxPrice - b.maxPrice);

  for (const rule of sortedRules) {
    if (price <= rule.maxPrice) {
      return rule.copies;
    }
  }
  // Fallback if no rules match (should not happen with Infinity rule)
  return 1;
}
