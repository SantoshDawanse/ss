/**
 * Cultural Context Service
 * Ensures content uses Nepali contexts (currency, geography, culture)
 * and validates terminology matches Nepal curriculum
 */

import { Language } from '../types/localization';

export interface CulturalContextConfig {
  currency: string;
  currencySymbol: string;
  distanceUnit: string;
  temperatureUnit: string;
  dateFormat: string;
  numberFormat: 'international' | 'nepali';
}

export interface ContentValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
}

export class CulturalContextService {
  private static instance: CulturalContextService;

  // Nepal-specific configuration
  private readonly nepaliContext: CulturalContextConfig = {
    currency: 'NPR',
    currencySymbol: 'रू',
    distanceUnit: 'km',
    temperatureUnit: 'celsius',
    dateFormat: 'YYYY/MM/DD',
    numberFormat: 'international',
  };

  // Nepal curriculum terminology mapping
  private readonly curriculumTerms: Record<string, { en: string; ne: string }> = {
    // Mathematics
    addition: { en: 'Addition', ne: 'जोड' },
    subtraction: { en: 'Subtraction', ne: 'घटाउ' },
    multiplication: { en: 'Multiplication', ne: 'गुणन' },
    division: { en: 'Division', ne: 'भाग' },
    fraction: { en: 'Fraction', ne: 'भिन्न' },
    decimal: { en: 'Decimal', ne: 'दशमलव' },
    percentage: { en: 'Percentage', ne: 'प्रतिशत' },
    geometry: { en: 'Geometry', ne: 'ज्यामिति' },
    algebra: { en: 'Algebra', ne: 'बीजगणित' },

    // Science
    physics: { en: 'Physics', ne: 'भौतिक विज्ञान' },
    chemistry: { en: 'Chemistry', ne: 'रसायन विज्ञान' },
    biology: { en: 'Biology', ne: 'जीवविज्ञान' },
    environment: { en: 'Environment', ne: 'वातावरण' },
    ecosystem: { en: 'Ecosystem', ne: 'पारिस्थितिकी तन्त्र' },

    // Social Studies
    geography: { en: 'Geography', ne: 'भूगोल' },
    history: { en: 'History', ne: 'इतिहास' },
    civics: { en: 'Civics', ne: 'नागरिक शास्त्र' },
    economics: { en: 'Economics', ne: 'अर्थशास्त्र' },
  };

  // Nepal-specific examples and contexts
  private readonly nepaliExamples = {
    cities: ['Kathmandu', 'Pokhara', 'Lalitpur', 'Bhaktapur', 'Biratnagar', 'Birgunj'],
    rivers: ['Bagmati', 'Koshi', 'Gandaki', 'Karnali', 'Mahakali'],
    mountains: ['Sagarmatha', 'Kanchenjunga', 'Lhotse', 'Makalu', 'Cho Oyu'],
    festivals: ['Dashain', 'Tihar', 'Holi', 'Buddha Jayanti', 'Teej'],
    foods: ['Dal Bhat', 'Momo', 'Sel Roti', 'Dhido', 'Gundruk'],
    animals: ['Yak', 'Red Panda', 'Snow Leopard', 'One-horned Rhinoceros', 'Bengal Tiger'],
    plants: ['Rhododendron', 'Sal', 'Bamboo', 'Deodar', 'Chir Pine'],
  };

  private constructor() {}

  static getInstance(): CulturalContextService {
    if (!CulturalContextService.instance) {
      CulturalContextService.instance = new CulturalContextService();
    }
    return CulturalContextService.instance;
  }

  /**
   * Get cultural context configuration
   */
  getContextConfig(): CulturalContextConfig {
    return { ...this.nepaliContext };
  }

  /**
   * Format currency amount in Nepali context
   */
  formatCurrency(amount: number): string {
    return `${this.nepaliContext.currencySymbol} ${amount.toLocaleString('en-NP')}`;
  }

  /**
   * Format distance in Nepali context
   */
  formatDistance(distance: number): string {
    return `${distance} ${this.nepaliContext.distanceUnit}`;
  }

  /**
   * Get curriculum term in specified language
   */
  getCurriculumTerm(termKey: string, language: Language): string {
    const term = this.curriculumTerms[termKey];
    if (!term) {
      console.warn(`Curriculum term not found: ${termKey}`);
      return termKey;
    }
    return term[language];
  }

  /**
   * Get all curriculum terms for a language
   */
  getAllCurriculumTerms(language: Language): Record<string, string> {
    const terms: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.curriculumTerms)) {
      terms[key] = value[language];
    }
    return terms;
  }

  /**
   * Validate content for cultural appropriateness
   */
  validateContent(content: string): ContentValidationResult {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for non-Nepali currency references
    const currencyPatterns = [/\$\d+/, /USD/, /EUR/, /GBP/, /INR/];
    for (const pattern of currencyPatterns) {
      if (pattern.test(content)) {
        issues.push('Content contains non-Nepali currency references');
        suggestions.push(`Use Nepali Rupees (${this.nepaliContext.currencySymbol}) instead`);
        break;
      }
    }

    // Check for non-metric units
    const imperialUnits = ['miles', 'feet', 'inches', 'pounds', 'fahrenheit'];
    for (const unit of imperialUnits) {
      if (content.toLowerCase().includes(unit)) {
        issues.push(`Content uses imperial unit: ${unit}`);
        suggestions.push('Use metric units (km, meters, celsius, kg)');
        break;
      }
    }

    // Check for culturally inappropriate examples
    const inappropriateContexts = ['christmas', 'thanksgiving', 'halloween', 'easter'];
    for (const context of inappropriateContexts) {
      if (content.toLowerCase().includes(context)) {
        issues.push(`Content references non-Nepali cultural context: ${context}`);
        suggestions.push(`Use Nepali festivals like ${this.nepaliExamples.festivals.join(', ')}`);
        break;
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * Get random Nepali example for a category
   */
  getNepaliExample(category: keyof typeof CulturalContextService.prototype.nepaliExamples): string {
    const examples = this.nepaliExamples[category];
    return examples[Math.floor(Math.random() * examples.length)];
  }

  /**
   * Get all Nepali examples for a category
   */
  getNepaliExamples(category: keyof typeof CulturalContextService.prototype.nepaliExamples): string[] {
    return [...this.nepaliExamples[category]];
  }

  /**
   * Suggest Nepali context replacements for content
   */
  suggestNepaliContext(content: string): string[] {
    const suggestions: string[] = [];

    // Suggest Nepali cities if generic city names are used
    if (/city|town|place/i.test(content)) {
      suggestions.push(`Consider using Nepali cities: ${this.nepaliExamples.cities.slice(0, 3).join(', ')}`);
    }

    // Suggest Nepali geography if geographic terms are used
    if (/river|mountain|hill/i.test(content)) {
      suggestions.push(`Consider using Nepali geography: ${this.nepaliExamples.rivers.slice(0, 2).join(', ')} (rivers), ${this.nepaliExamples.mountains.slice(0, 2).join(', ')} (mountains)`);
    }

    // Suggest Nepali festivals if celebration/festival is mentioned
    if (/festival|celebration|holiday/i.test(content)) {
      suggestions.push(`Consider using Nepali festivals: ${this.nepaliExamples.festivals.slice(0, 3).join(', ')}`);
    }

    return suggestions;
  }

  /**
   * Check if terminology matches Nepal curriculum standards
   */
  validateTerminology(term: string, language: Language): boolean {
    for (const curriculumTerm of Object.values(this.curriculumTerms)) {
      if (curriculumTerm[language].toLowerCase() === term.toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get Nepal curriculum grade levels
   */
  getGradeLevels(): number[] {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  /**
   * Get subjects for Nepal K-12 curriculum
   */
  getSubjects(language: Language): string[] {
    const subjects = {
      en: ['Mathematics', 'Science', 'Nepali', 'English', 'Social Studies'],
      ne: ['गणित', 'विज्ञान', 'नेपाली', 'अंग्रेजी', 'सामाजिक अध्ययन'],
    };
    return subjects[language];
  }
}
