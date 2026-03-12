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

// Mock React Native AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
  },
}));

// Mock Expo modules
jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(() => Promise.resolve(1.0)),
  getBatteryStateAsync: jest.fn(() => Promise.resolve(2)),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://test/',
  cacheDirectory: 'file://test/cache/',
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
  downloadAsync: jest.fn(() => Promise.resolve({ uri: 'file://test/bundle.zip', status: 200 })),
  createDownloadResumable: jest.fn(() => ({
    downloadAsync: jest.fn(() => Promise.resolve({ uri: 'file://test/bundle.zip' })),
  })),
  EncodingType: {
    Base64: 'base64',
    UTF8: 'utf8',
  },
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(() => Promise.resolve('mock-hash')),
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      apiBaseUrl: 'https://test-api.example.com',
    },
  },
}));

// Mock crypto-js
jest.mock('crypto-js', () => ({
  SHA256: jest.fn(() => ({
    toString: jest.fn(() => 'mock-sha256-hash'),
  })),
  enc: {
    Base64: {
      parse: jest.fn(() => 'mock-word-array'),
    },
    Hex: 'hex',
  },
}));
