/**
 * Mock for expo-file-system/legacy
 * Used in integration tests to avoid actual file system operations
 */

export const downloadAsync = jest.fn();
export const readAsStringAsync = jest.fn();
export const writeAsStringAsync = jest.fn();
export const deleteAsync = jest.fn();
export const getInfoAsync = jest.fn();
export const makeDirectoryAsync = jest.fn();
export const moveAsync = jest.fn();
export const copyAsync = jest.fn();

// Export default object for legacy import style
export default {
  downloadAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  copyAsync,
};
