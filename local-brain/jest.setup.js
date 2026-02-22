// Jest setup file
global.console = {
  ...console,
  // Suppress console logs during tests
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
