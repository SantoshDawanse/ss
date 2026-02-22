/**
 * Localization Service Tests
 * Tests for language support and localization features
 */

import { LocalizationService } from '../src/services/LocalizationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

describe('LocalizationService', () => {
  let service: LocalizationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset singleton instance
    (LocalizationService as any).instance = undefined;
    service = LocalizationService.getInstance();
    await service.initialize();
  });

  describe('Initialization', () => {
    it('should initialize with default language (English)', () => {
      expect(service.getLanguage()).toBe('en');
    });

    it('should load saved language preference', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('ne');
      const newService = LocalizationService.getInstance();
      await newService.initialize();
      expect(newService.getLanguage()).toBe('ne');
    });

    it('should handle initialization errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      const newService = LocalizationService.getInstance();
      await expect(newService.initialize()).resolves.not.toThrow();
    });
  });

  describe('Language Management', () => {
    it('should switch to Nepali language', async () => {
      await service.setLanguage('ne');
      expect(service.getLanguage()).toBe('ne');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@sikshya_sathi:language', 'ne');
    });

    it('should switch to English language', async () => {
      await service.setLanguage('en');
      expect(service.getLanguage()).toBe('en');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@sikshya_sathi:language', 'en');
    });

    it('should reject unsupported languages', async () => {
      await expect(service.setLanguage('fr' as any)).rejects.toThrow('Unsupported language: fr');
    });

    it('should notify listeners on language change', async () => {
      const listener = jest.fn();
      service.subscribe(listener);
      
      await service.setLanguage('ne');
      
      expect(listener).toHaveBeenCalledWith('ne');
    });

    it('should allow unsubscribing from language changes', async () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe(listener);
      
      unsubscribe();
      await service.setLanguage('ne');
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Translation Strings', () => {
    it('should return English strings by default', () => {
      const strings = service.getStrings();
      expect(strings.common.ok).toBe('OK');
      expect(strings.navigation.home).toBe('Home');
      expect(strings.lessons.title).toBe('Lessons');
    });

    it('should return Nepali strings when language is Nepali', async () => {
      await service.setLanguage('ne');
      const strings = service.getStrings();
      expect(strings.common.ok).toBe('ठीक छ');
      expect(strings.navigation.home).toBe('गृह');
      expect(strings.lessons.title).toBe('पाठहरू');
    });

    it('should get specific string by path', () => {
      expect(service.getString('common.ok')).toBe('OK');
      expect(service.getString('navigation.lessons')).toBe('Lessons');
      expect(service.getString('quizzes.startQuiz')).toBe('Start Quiz');
    });

    it('should get Nepali string by path', async () => {
      await service.setLanguage('ne');
      expect(service.getString('common.ok')).toBe('ठीक छ');
      expect(service.getString('navigation.lessons')).toBe('पाठहरू');
      expect(service.getString('quizzes.startQuiz')).toBe('प्रश्नोत्तरी सुरु गर्नुहोस्');
    });

    it('should return path if translation not found', () => {
      expect(service.getString('nonexistent.key')).toBe('nonexistent.key');
    });

    it('should handle nested paths correctly', () => {
      expect(service.getString('subjects.mathematics')).toBe('Mathematics');
      expect(service.getString('difficulty.easy')).toBe('Easy');
    });
  });

  describe('Available Languages', () => {
    it('should return list of available languages', () => {
      const languages = service.getAvailableLanguages();
      expect(languages).toEqual(['en', 'ne']);
    });

    it('should return language display names', () => {
      expect(service.getLanguageDisplayName('en')).toBe('English');
      expect(service.getLanguageDisplayName('ne')).toBe('नेपाली');
    });
  });

  describe('Devanagari Script Support', () => {
    it('should properly render Nepali Devanagari script', async () => {
      await service.setLanguage('ne');
      const strings = service.getStrings();
      
      // Verify Devanagari characters are present
      expect(strings.common.ok).toMatch(/[\u0900-\u097F]/); // Devanagari Unicode range
      expect(strings.subjects.mathematics).toBe('गणित');
      expect(strings.subjects.science).toBe('विज्ञान');
    });

    it('should handle all UI strings in Nepali', async () => {
      await service.setLanguage('ne');
      const strings = service.getStrings();
      
      // Verify all major sections have Nepali translations
      expect(strings.common.cancel).toBeTruthy();
      expect(strings.navigation.progress).toBeTruthy();
      expect(strings.lessons.completeLesson).toBeTruthy();
      expect(strings.quizzes.correct).toBeTruthy();
      expect(strings.settings.language).toBeTruthy();
    });
  });

  describe('Persistence', () => {
    it('should persist language preference', async () => {
      await service.setLanguage('ne');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@sikshya_sathi:language', 'ne');
    });

    it('should handle storage errors gracefully', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      await expect(service.setLanguage('ne')).resolves.not.toThrow();
    });
  });
});
