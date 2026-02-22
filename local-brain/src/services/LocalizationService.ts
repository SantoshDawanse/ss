/**
 * Localization Service
 * Manages language switching and provides localized strings
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, LocalizationStrings } from '../types/localization';
import { en } from '../localization/en';
import { ne } from '../localization/ne';

const LANGUAGE_STORAGE_KEY = '@sikshya_sathi:language';

export class LocalizationService {
  private static instance: LocalizationService;
  private currentLanguage: Language = 'en';
  private translations: Record<Language, LocalizationStrings> = {
    en,
    ne,
  };
  private listeners: Set<(language: Language) => void> = new Set();

  private constructor() {}

  static getInstance(): LocalizationService {
    if (!LocalizationService.instance) {
      LocalizationService.instance = new LocalizationService();
    }
    return LocalizationService.instance;
  }

  /**
   * Initialize the service and load saved language preference
   */
  async initialize(): Promise<void> {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'ne')) {
        this.currentLanguage = savedLanguage;
      }
    } catch (error) {
      console.error('Failed to load language preference:', error);
    }
  }

  /**
   * Get current language
   */
  getLanguage(): Language {
    return this.currentLanguage;
  }

  /**
   * Set current language
   */
  async setLanguage(language: Language): Promise<void> {
    if (language !== 'en' && language !== 'ne') {
      throw new Error(`Unsupported language: ${language}`);
    }

    this.currentLanguage = language;

    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }

    // Notify listeners
    this.listeners.forEach((listener) => listener(language));
  }

  /**
   * Get all translations for current language
   */
  getStrings(): LocalizationStrings {
    return this.translations[this.currentLanguage];
  }

  /**
   * Get a specific translation string by path
   * Example: getString('common.ok') returns 'OK' or 'ठीक छ'
   */
  getString(path: string): string {
    const keys = path.split('.');
    let value: any = this.translations[this.currentLanguage];

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        console.warn(`Translation not found for path: ${path}`);
        return path;
      }
    }

    return typeof value === 'string' ? value : path;
  }

  /**
   * Subscribe to language changes
   */
  subscribe(listener: (language: Language) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get available languages
   */
  getAvailableLanguages(): Language[] {
    return ['en', 'ne'];
  }

  /**
   * Get language display name
   */
  getLanguageDisplayName(language: Language): string {
    const displayNames: Record<Language, string> = {
      en: 'English',
      ne: 'नेपाली',
    };
    return displayNames[language];
  }
}
