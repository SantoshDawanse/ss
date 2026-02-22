/**
 * Accessibility Service
 * Manages text size, simplified UI mode, and text-to-speech features
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { AccessibilitySettings, TextSize, TEXT_SIZE_CONFIGS, TextSizeConfig } from '../types/accessibility';

const ACCESSIBILITY_STORAGE_KEY = '@sikshya_sathi:accessibility';

export class AccessibilityService {
  private static instance: AccessibilityService;
  private settings: AccessibilitySettings = {
    textSize: 'medium',
    simplifiedUI: false,
    textToSpeechEnabled: false,
    highContrast: false,
  };
  private listeners: Set<(settings: AccessibilitySettings) => void> = new Set();
  private isSpeaking: boolean = false;

  private constructor() {}

  static getInstance(): AccessibilityService {
    if (!AccessibilityService.instance) {
      AccessibilityService.instance = new AccessibilityService();
    }
    return AccessibilityService.instance;
  }

  /**
   * Initialize the service and load saved settings
   */
  async initialize(): Promise<void> {
    try {
      const savedSettings = await AsyncStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
      if (savedSettings) {
        this.settings = JSON.parse(savedSettings);
      }
    } catch (error) {
      console.error('Failed to load accessibility settings:', error);
    }
  }

  /**
   * Get current accessibility settings
   */
  getSettings(): AccessibilitySettings {
    return { ...this.settings };
  }

  /**
   * Update accessibility settings
   */
  async updateSettings(updates: Partial<AccessibilitySettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };

    try {
      await AsyncStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save accessibility settings:', error);
    }

    // Notify listeners
    this.listeners.forEach((listener) => listener(this.settings));
  }

  /**
   * Set text size
   */
  async setTextSize(size: TextSize): Promise<void> {
    await this.updateSettings({ textSize: size });
  }

  /**
   * Get text size configuration
   */
  getTextSizeConfig(): TextSizeConfig {
    return TEXT_SIZE_CONFIGS[this.settings.textSize];
  }

  /**
   * Get font size for a specific text type
   */
  getFontSize(type: keyof TextSizeConfig): number {
    return TEXT_SIZE_CONFIGS[this.settings.textSize][type];
  }

  /**
   * Toggle simplified UI mode
   */
  async toggleSimplifiedUI(): Promise<void> {
    await this.updateSettings({ simplifiedUI: !this.settings.simplifiedUI });
  }

  /**
   * Set simplified UI mode
   */
  async setSimplifiedUI(enabled: boolean): Promise<void> {
    await this.updateSettings({ simplifiedUI: enabled });
  }

  /**
   * Check if simplified UI is enabled
   */
  isSimplifiedUIEnabled(): boolean {
    return this.settings.simplifiedUI;
  }

  /**
   * Toggle text-to-speech
   */
  async toggleTextToSpeech(): Promise<void> {
    await this.updateSettings({ textToSpeechEnabled: !this.settings.textToSpeechEnabled });
  }

  /**
   * Set text-to-speech enabled state
   */
  async setTextToSpeechEnabled(enabled: boolean): Promise<void> {
    await this.updateSettings({ textToSpeechEnabled: enabled });
    
    // Stop speaking if disabling
    if (!enabled && this.isSpeaking) {
      await this.stopSpeaking();
    }
  }

  /**
   * Check if text-to-speech is enabled
   */
  isTextToSpeechEnabled(): boolean {
    return this.settings.textToSpeechEnabled;
  }

  /**
   * Speak text aloud (offline text-to-speech)
   */
  async speak(text: string, language: 'en' | 'ne' = 'en'): Promise<void> {
    if (!this.settings.textToSpeechEnabled) {
      console.log('Text-to-speech is disabled');
      return;
    }

    try {
      // Stop any ongoing speech
      await this.stopSpeaking();

      this.isSpeaking = true;

      // Map language codes to Speech API language codes
      const languageCode = language === 'ne' ? 'ne-NP' : 'en-US';

      await Speech.speak(text, {
        language: languageCode,
        pitch: 1.0,
        rate: 0.9, // Slightly slower for better comprehension
        onDone: () => {
          this.isSpeaking = false;
        },
        onStopped: () => {
          this.isSpeaking = false;
        },
        onError: (error) => {
          console.error('Text-to-speech error:', error);
          this.isSpeaking = false;
        },
      });
    } catch (error) {
      console.error('Failed to speak text:', error);
      this.isSpeaking = false;
    }
  }

  /**
   * Stop speaking
   */
  async stopSpeaking(): Promise<void> {
    try {
      await Speech.stop();
      this.isSpeaking = false;
    } catch (error) {
      console.error('Failed to stop speaking:', error);
    }
  }

  /**
   * Check if currently speaking
   */
  isSpeakingNow(): boolean {
    return this.isSpeaking;
  }

  /**
   * Check if text-to-speech is available
   */
  async isTextToSpeechAvailable(): Promise<boolean> {
    try {
      const available = await Speech.isSpeakingAsync();
      return true; // If we can check, it's available
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available voices for a language
   */
  async getAvailableVoices(language: 'en' | 'ne' = 'en'): Promise<Speech.Voice[]> {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const languageCode = language === 'ne' ? 'ne' : 'en';
      return voices.filter((voice) => voice.language.startsWith(languageCode));
    } catch (error) {
      console.error('Failed to get available voices:', error);
      return [];
    }
  }

  /**
   * Toggle high contrast mode
   */
  async toggleHighContrast(): Promise<void> {
    await this.updateSettings({ highContrast: !this.settings.highContrast });
  }

  /**
   * Set high contrast mode
   */
  async setHighContrast(enabled: boolean): Promise<void> {
    await this.updateSettings({ highContrast: enabled });
  }

  /**
   * Check if high contrast is enabled
   */
  isHighContrastEnabled(): boolean {
    return this.settings.highContrast;
  }

  /**
   * Subscribe to settings changes
   */
  subscribe(listener: (settings: AccessibilitySettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get recommended settings for grade level
   * Younger students (K-5) get simplified UI by default
   */
  getRecommendedSettings(grade: number): Partial<AccessibilitySettings> {
    if (grade <= 5) {
      return {
        simplifiedUI: true,
        textSize: 'large',
      };
    }
    return {
      simplifiedUI: false,
      textSize: 'medium',
    };
  }

  /**
   * Apply recommended settings for grade level
   */
  async applyRecommendedSettings(grade: number): Promise<void> {
    const recommended = this.getRecommendedSettings(grade);
    await this.updateSettings(recommended);
  }
}
