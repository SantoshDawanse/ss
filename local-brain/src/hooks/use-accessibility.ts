/**
 * Accessibility Hook
 * Provides easy access to accessibility features in React components
 */

import { useState, useEffect } from 'react';
import { AccessibilityService } from '../services/AccessibilityService';
import { AccessibilitySettings, TextSize, TextSizeConfig } from '../types/accessibility';

export function useAccessibility() {
  const accessibilityService = AccessibilityService.getInstance();
  const [settings, setSettings] = useState<AccessibilitySettings>(accessibilityService.getSettings());
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    // Subscribe to settings changes
    const unsubscribe = accessibilityService.subscribe((newSettings) => {
      setSettings(newSettings);
    });

    // Check speaking status periodically
    const interval = setInterval(() => {
      setIsSpeaking(accessibilityService.isSpeakingNow());
    }, 500);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const setTextSize = async (size: TextSize) => {
    await accessibilityService.setTextSize(size);
  };

  const toggleSimplifiedUI = async () => {
    await accessibilityService.toggleSimplifiedUI();
  };

  const toggleTextToSpeech = async () => {
    await accessibilityService.toggleTextToSpeech();
  };

  const speak = async (text: string, language: 'en' | 'ne' = 'en') => {
    await accessibilityService.speak(text, language);
  };

  const stopSpeaking = async () => {
    await accessibilityService.stopSpeaking();
  };

  const getTextSizeConfig = (): TextSizeConfig => {
    return accessibilityService.getTextSizeConfig();
  };

  const getFontSize = (type: keyof TextSizeConfig): number => {
    return accessibilityService.getFontSize(type);
  };

  return {
    settings,
    textSize: settings.textSize,
    simplifiedUI: settings.simplifiedUI,
    textToSpeechEnabled: settings.textToSpeechEnabled,
    highContrast: settings.highContrast,
    isSpeaking,
    setTextSize,
    toggleSimplifiedUI,
    toggleTextToSpeech,
    speak,
    stopSpeaking,
    getTextSizeConfig,
    getFontSize,
  };
}
