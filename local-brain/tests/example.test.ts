/**
 * Example test file demonstrating Jest setup.
 */

describe('Example Unit Tests', () => {
  it('should perform basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string operations', () => {
    const greeting = 'Hello, World!';
    expect(greeting).toContain('World');
  });
});

describe('Example Async Tests', () => {
  it('should handle promises', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
