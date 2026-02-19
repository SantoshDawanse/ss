/**
 * Example property-based test file demonstrating fast-check setup.
 */

import fc from 'fast-check';

describe('Example Property-Based Tests', () => {
  it('should verify addition is commutative', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (x, y) => {
        return x + y === y + x;
      }),
      {numRuns: 100}
    );
  });

  it('should verify array reverse is involutive', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), arr => {
        const reversed = [...arr].reverse();
        const doubleReversed = [...reversed].reverse();
        return JSON.stringify(arr) === JSON.stringify(doubleReversed);
      }),
      {numRuns: 100}
    );
  });

  it('should verify string concatenation length', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (s1, s2) => {
        const concatenated = s1 + s2;
        return concatenated.length === s1.length + s2.length;
      }),
      {numRuns: 100}
    );
  });
});
