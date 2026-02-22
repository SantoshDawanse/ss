/**
 * Localization Hook
 * Provides easy access to localized strings in React components
 */

import { useState, useEffect } from 'react';
import { LocalizationService } from '../services/LocalizationService';
import { Language, LocalizationStrings } from '../types/localization';

export function useLocalization() {
  const localizationService = LocalizationService.getInstance();
  const [language, setLanguage] = useState<Language>(localizationService.getLanguage());
  const [strings, setStrings] = useState<LocalizationStrings>(localizationService.getStrings());

  useEffect(() => {
    // Subscribe to language changes
    const unsubscribe = localizationService.subscribe((newLanguage) => {
      setLanguage(newLanguage);
      setStrings(localizationService.getStrings());
    });

    return unsubscribe;
  }, []);

  const changeLanguage = async (newLanguage: Language) => {
    await localizationService.setLanguage(newLanguage);
  };

  const getString = (path: string): string => {
    return localizationService.getString(path);
  };

  return {
    language,
    strings,
    changeLanguage,
    getString,
    availableLanguages: localizationService.getAvailableLanguages(),
    getLanguageDisplayName: localizationService.getLanguageDisplayName.bind(localizationService),
  };
}
