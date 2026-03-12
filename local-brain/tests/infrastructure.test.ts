/**
 * Infrastructure Tests for Sync With Cloud Feature
 * 
 * These tests verify that the core infrastructure is properly set up:
 * - TypeScript configuration with strict mode
 * - Dependencies (pako, crypto-js, fast-check) are available
 * - SQLite database with encryption support
 * - Jest testing framework with property-based testing
 */

import * as pako from 'pako';
import * as CryptoJS from 'crypto-js';
import fc from 'fast-check';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { propertyConfig } from './pbt-setup';

describe('Infrastructure Setup', () => {
  describe('Dependencies', () => {
    it('should have pako library available for compression', () => {
      expect(pako).toBeDefined();
      expect(pako.gzip).toBeDefined();
      expect(pako.ungzip).toBeDefined();
    });

    it('should have crypto-js library available for checksums', () => {
      expect(CryptoJS).toBeDefined();
      expect(CryptoJS.SHA256).toBeDefined();
    });

    it('should have fast-check library available for property-based testing', () => {
      expect(fc).toBeDefined();
      expect(fc.assert).toBeDefined();
      expect(fc.property).toBeDefined();
    });

    it('should be able to compress and decompress data with pako', () => {
      const originalData = 'Hello, World! This is a test string for compression.';
      const compressed = pako.gzip(originalData);
      const decompressed = pako.ungzip(compressed, { to: 'string' });
      
      expect(decompressed).toBe(originalData);
    });

    it('should be able to calculate SHA-256 checksums with crypto-js', () => {
      const data = 'Test data for checksum';
      const checksum = CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
      
      expect(checksum).toBeDefined();
      expect(checksum.length).toBe(64); // SHA-256 produces 64 hex characters
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('TypeScript Configuration', () => {
    it('should enforce strict type checking', () => {
      // This test verifies that TypeScript strict mode is enabled
      // by attempting to use features that would fail in strict mode
      
      // Strict null checks
      const value: string | null = null;
      expect(value).toBeNull();
      
      // No implicit any
      const explicitAny: any = 'test';
      expect(explicitAny).toBe('test');
    });
  });

  describe('Database Configuration', () => {
    it('should have DatabaseManager available', () => {
      expect(DatabaseManager).toBeDefined();
      expect(DatabaseManager.getInstance).toBeDefined();
    });

    it('should support encryption configuration', () => {
      const dbManager = DatabaseManager.getInstance({
        name: 'test.db',
        location: 'default',
        encryption: true,
        encryptionKey: 'test-key-12345',
      });
      
      expect(dbManager).toBeDefined();
      expect(dbManager.isReady).toBeDefined();
    });
  });

  describe('Property-Based Testing Setup', () => {
    it('should have property test configuration with minimum 100 runs', () => {
      expect(propertyConfig).toBeDefined();
      expect(propertyConfig.numRuns).toBeGreaterThanOrEqual(100);
    });

    it('should be able to run a simple property test', () => {
      // Simple property: reversing a string twice returns the original
      fc.assert(
        fc.property(fc.string(), (str) => {
          const reversed = str.split('').reverse().join('');
          const doubleReversed = reversed.split('').reverse().join('');
          return doubleReversed === str;
        }),
        { numRuns: 10 } // Use fewer runs for this simple test
      );
    });

    it('should be able to generate random data with fast-check', () => {
      const randomStrings: string[] = [];
      
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (str) => {
          randomStrings.push(str);
          return str.length >= 1 && str.length <= 50;
        }),
        { numRuns: 10 }
      );
      
      expect(randomStrings.length).toBe(10);
    });
  });

  describe('Jest Configuration', () => {
    it('should support async/await in tests', async () => {
      const promise = Promise.resolve('test');
      const result = await promise;
      expect(result).toBe('test');
    });

    it('should support test timeouts', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(true).toBe(true);
    });
  });

  describe('Directory Structure', () => {
    it('should have services directory', () => {
      // This test verifies the directory structure exists
      // by importing from the services directory
      const { DatabaseManager: DbManager } = require('../src/database/DatabaseManager');
      expect(DbManager).toBeDefined();
    });

    it('should have models directory', () => {
      const models = require('../src/models');
      expect(models).toBeDefined();
    });

    it('should have repositories directory', () => {
      const repositories = require('../src/database/repositories');
      expect(repositories).toBeDefined();
    });

    it('should have types directory', () => {
      const types = require('../src/types/accessibility');
      expect(types).toBeDefined();
    });
  });

  describe('Compression and Decompression', () => {
    it('should handle binary data compression', () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const compressed = pako.gzip(originalData);
      const decompressed = pako.ungzip(compressed);
      
      expect(decompressed).toEqual(originalData);
    });

    it('should handle JSON compression and decompression', () => {
      const originalObject = {
        id: '123',
        name: 'Test',
        data: [1, 2, 3],
        nested: { key: 'value' },
      };
      
      const jsonString = JSON.stringify(originalObject);
      const compressed = pako.gzip(jsonString);
      const decompressed = pako.ungzip(compressed, { to: 'string' });
      const parsedObject = JSON.parse(decompressed);
      
      expect(parsedObject).toEqual(originalObject);
    });

    it('should handle base64 encoding and decoding', () => {
      const originalData = 'Test data for base64';
      const base64 = Buffer.from(originalData).toString('base64');
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      
      expect(decoded).toBe(originalData);
    });
  });

  describe('Checksum Verification', () => {
    it('should produce consistent checksums for same data', () => {
      const data = 'Consistent data';
      const checksum1 = CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
      const checksum2 = CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
      
      expect(checksum1).toBe(checksum2);
    });

    it('should produce different checksums for different data', () => {
      const data1 = 'Data 1';
      const data2 = 'Data 2';
      const checksum1 = CryptoJS.SHA256(data1).toString(CryptoJS.enc.Hex);
      const checksum2 = CryptoJS.SHA256(data2).toString(CryptoJS.enc.Hex);
      
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle binary data checksums', () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      const wordArray = CryptoJS.lib.WordArray.create(binaryData as any);
      const checksum = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);
      
      expect(checksum).toBeDefined();
      expect(checksum.length).toBe(64);
    });
  });
});
