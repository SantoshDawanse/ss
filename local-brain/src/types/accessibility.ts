/**
 * Accessibility Types
 */

export type TextSize = 'small' | 'medium' | 'large' | 'extraLarge';

export interface AccessibilitySettings {
  textSize: TextSize;
  simplifiedUI: boolean;
  textToSpeechEnabled: boolean;
  highContrast: boolean;
}

export interface TextSizeConfig {
  base: number;
  heading1: number;
  heading2: number;
  heading3: number;
  body: number;
  caption: number;
}

export const TEXT_SIZE_CONFIGS: Record<TextSize, TextSizeConfig> = {
  small: {
    base: 14,
    heading1: 24,
    heading2: 20,
    heading3: 18,
    body: 14,
    caption: 12,
  },
  medium: {
    base: 16,
    heading1: 28,
    heading2: 24,
    heading3: 20,
    body: 16,
    caption: 14,
  },
  large: {
    base: 18,
    heading1: 32,
    heading2: 28,
    heading3: 24,
    body: 18,
    caption: 16,
  },
  extraLarge: {
    base: 22,
    heading1: 38,
    heading2: 34,
    heading3: 28,
    body: 22,
    caption: 18,
  },
};
