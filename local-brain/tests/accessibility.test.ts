/**
 * Accessibility Service Tests
 * Tests for text size, simplified UI, and text-to-speech features
 */

import { AccessibilityService } from '../src/services/AccessibilityService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

// Mock expo-speech
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(),
  getAvailableVoicesAsync: jest.fn(),
}));

describe('AccessibilityService', () => {
  let service: AccessibilityService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset singleton instance
    (AccessibilityService as any).instance = undefined;
    service = AccessibilityService.getInstance();
    await service.initialize();
  });

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      const settings = service.getSettings();
      expect(settings.textSize).toBe('medium');
      expect(settings.simplifiedUI).toBe(false);
      expect(settings.textToSpeechEnabled).toBe(false);
      expect(settings.highContrast).toBe(false);
    });

    it('should load saved settings', async () => {
      const savedSettings = {
        textSize: 'large',
        simplifiedUI: true,
        textToSpeechEnabled: true,
        highContrast: false,
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(savedSettings));
      
      const newService = AccessibilityService.getInstance();
      await newService.initialize();
      
      const settings = newService.getSettings();
      expect(settings.textSize).toBe('large');
      expect(settings.simplifiedUI).toBe(true);
      expect(settings.textToSpeechEnabled).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      const newService = AccessibilityService.getInstance();
      await expect(newService.initialize()).resolves.not.toThrow();
    });
  });

  describe('Text Size Management', () => {
    it('should set text size to small', async () => {
      await service.setTextSize('small');
      expect(service.getSettings().textSize).toBe('small');
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should set text size to medium', async () => {
      await service.setTextSize('medium');
      expect(service.getSettings().textSize).toBe('medium');
    });

    it('should set text size to large', async () => {
      await service.setTextSize('large');
      expect(service.getSettings().textSize).toBe('large');
    });

    it('should set text size to extra large', async () => {
      await service.setTextSize('extraLarge');
      expect(service.getSettings().textSize).toBe('extraLarge');
    });

    it('should get text size configuration', () => {
      const config = service.getTextSizeConfig();
      expect(config).toHaveProperty('base');
      expect(config).toHaveProperty('heading1');
      expect(config).toHaveProperty('body');
    });

    it('should get correct font sizes for medium text', () => {
      expect(service.getFontSize('base')).toBe(16);
      expect(service.getFontSize('heading1')).toBe(28);
      expect(service.getFontSize('body')).toBe(16);
    });

    it('should get correct font sizes for large text', async () => {
      await service.setTextSize('large');
      expect(service.getFontSize('base')).toBe(18);
      expect(service.getFontSize('heading1')).toBe(32);
      expect(service.getFontSize('body')).toBe(18);
    });

    it('should notify listeners on text size change', async () => {
      const listener = jest.fn();
      service.subscribe(listener);
      
      await service.setTextSize('large');
      
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].textSize).toBe('large');
    });
  });

  describe('Simplified UI Mode', () => {
    it('should toggle simplified UI', async () => {
      expect(service.isSimplifiedUIEnabled()).toBe(false);
      
      await service.toggleSimplifiedUI();
      expect(service.isSimplifiedUIEnabled()).toBe(true);
      
      await service.toggleSimplifiedUI();
      expect(service.isSimplifiedUIEnabled()).toBe(false);
    });

    it('should set simplified UI enabled', async () => {
      await service.setSimplifiedUI(true);
      expect(service.isSimplifiedUIEnabled()).toBe(true);
    });

    it('should set simplified UI disabled', async () => {
      await service.setSimplifiedUI(false);
      expect(service.isSimplifiedUIEnabled()).toBe(false);
    });

    it('should persist simplified UI setting', async () => {
      await service.setSimplifiedUI(true);
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should notify listeners on simplified UI change', async () => {
      const listener = jest.fn();
      service.subscribe(listener);
      
      await service.toggleSimplifiedUI();
      
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][0].simplifiedUI).toBe(true);
    });
  });

  describe('Text-to-Speech', () => {
    it('should toggle text-to-speech', async () => {
      expect(service.isTextToSpeechEnabled()).toBe(false);
      
      await service.toggleTextToSpeech();
      expect(service.isTextToSpeechEnabled()).toBe(true);
      
      await service.toggleTextToSpeech();
      expect(service.isTextToSpeechEnabled()).toBe(false);
    });

    it('should set text-to-speech enabled', async () => {
      await service.setTextToSpeechEnabled(true);
      expect(service.isTextToSpeechEnabled()).toBe(true);
    });

    it('should speak text when enabled', async () => {
      await service.setTextToSpeechEnabled(true);
      await service.speak('Hello world', 'en');
      
      expect(Speech.speak).toHaveBeenCalledWith(
        'Hello world',
        expect.objectContaining({
          language: 'en-US',
          pitch: 1.0,
          rate: 0.9,
        })
      );
    });

    it('should speak Nepali text with correct language code', async () => {
      await service.setTextToSpeechEnabled(true);
      await service.speak('नमस्ते', 'ne');
      
      expect(Speech.speak).toHaveBeenCalledWith(
        'नमस्ते',
        expect.objectContaining({
          language: 'ne-NP',
        })
      );
    });

    it('should not speak when text-to-speech is disabled', async () => {
      await service.setTextToSpeechEnabled(false);
      await service.speak('Hello world', 'en');
      
      expect(Speech.speak).not.toHaveBeenCalled();
    });

    it('should stop speaking', async () => {
      await service.stopSpeaking();
      expect(Speech.stop).toHaveBeenCalled();
    });

    it('should stop speaking when disabling text-to-speech', async () => {
      await service.setTextToSpeechEnabled(true);
      await service.speak('Hello world', 'en');
      
      await service.setTextToSpeechEnabled(false);
      
      expect(Speech.stop).toHaveBeenCalled();
    });

    it('should check if text-to-speech is available', async () => {
      (Speech.isSpeakingAsync as jest.Mock).mockResolvedValue(false);
      const available = await service.isTextToSpeechAvailable();
      expect(available).toBe(true);
    });

    it('should handle text-to-speech errors gracefully', async () => {
      (Speech.speak as jest.Mock).mockRejectedValue(new Error('Speech error'));
      await service.setTextToSpeechEnabled(true);
      
      await expect(service.speak('Hello', 'en')).resolves.not.toThrow();
    });

    it('should get available voices', async () => {
      const mockVoices = [
        { language: 'en-US', name: 'English Voice' },
        { language: 'ne-NP', name: 'Nepali Voice' },
      ];
      (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValue(mockVoices);
      
      const voices = await service.getAvailableVoices('en');
      expect(voices).toHaveLength(1);
      expect(voices[0].language).toBe('en-US');
    });
  });

  describe('High Contrast Mode', () => {
    it('should toggle high contrast', async () => {
      expect(service.isHighContrastEnabled()).toBe(false);
      
      await service.toggleHighContrast();
      expect(service.isHighContrastEnabled()).toBe(true);
      
      await service.toggleHighContrast();
      expect(service.isHighContrastEnabled()).toBe(false);
    });

    it('should set high contrast enabled', async () => {
      await service.setHighContrast(true);
      expect(service.isHighContrastEnabled()).toBe(true);
    });

    it('should persist high contrast setting', async () => {
      await service.setHighContrast(true);
      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Grade-Based Recommendations', () => {
    it('should recommend simplified UI for younger students (K-5)', () => {
      const settings = service.getRecommendedSettings(3);
      expect(settings.simplifiedUI).toBe(true);
      expect(settings.textSize).toBe('large');
    });

    it('should not recommend simplified UI for older students (6-12)', () => {
      const settings = service.getRecommendedSettings(8);
      expect(settings.simplifiedUI).toBe(false);
      expect(settings.textSize).toBe('medium');
    });

    it('should apply recommended settings for grade 2', async () => {
      await service.applyRecommendedSettings(2);
      const settings = service.getSettings();
      expect(settings.simplifiedUI).toBe(true);
      expect(settings.textSize).toBe('large');
    });

    it('should apply recommended settings for grade 10', async () => {
      await service.applyRecommendedSettings(10);
      const settings = service.getSettings();
      expect(settings.simplifiedUI).toBe(false);
      expect(settings.textSize).toBe('medium');
    });
  });

  describe('Settings Persistence', () => {
    it('should persist all settings', async () => {
      await service.updateSettings({
        textSize: 'large',
        simplifiedUI: true,
        textToSpeechEnabled: true,
        highContrast: true,
      });
      
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@sikshya_sathi:accessibility',
        expect.stringContaining('large')
      );
    });

    it('should handle storage errors gracefully', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      await expect(service.setTextSize('large')).resolves.not.toThrow();
    });
  });

  describe('Listener Management', () => {
    it('should allow multiple listeners', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      service.subscribe(listener1);
      service.subscribe(listener2);
      
      await service.setTextSize('large');
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should allow unsubscribing', async () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe(listener);
      
      unsubscribe();
      await service.setTextSize('large');
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Text Size Configurations', () => {
    it('should have correct small text sizes', async () => {
      await service.setTextSize('small');
      expect(service.getFontSize('base')).toBe(14);
      expect(service.getFontSize('heading1')).toBe(24);
      expect(service.getFontSize('caption')).toBe(12);
    });

    it('should have correct extra large text sizes', async () => {
      await service.setTextSize('extraLarge');
      expect(service.getFontSize('base')).toBe(22);
      expect(service.getFontSize('heading1')).toBe(38);
      expect(service.getFontSize('caption')).toBe(18);
    });
  });
});
