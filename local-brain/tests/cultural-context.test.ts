/**
 * Cultural Context Service Tests
 * Tests for Nepali cultural context and curriculum alignment
 */

import { CulturalContextService } from '../src/services/CulturalContextService';

describe('CulturalContextService', () => {
  let service: CulturalContextService;

  beforeEach(() => {
    // Reset singleton instance
    (CulturalContextService as any).instance = undefined;
    service = CulturalContextService.getInstance();
  });

  describe('Cultural Context Configuration', () => {
    it('should provide Nepali context configuration', () => {
      const config = service.getContextConfig();
      expect(config.currency).toBe('NPR');
      expect(config.currencySymbol).toBe('रू');
      expect(config.distanceUnit).toBe('km');
      expect(config.temperatureUnit).toBe('celsius');
    });

    it('should format currency in Nepali context', () => {
      expect(service.formatCurrency(1000)).toContain('रू');
      expect(service.formatCurrency(1000)).toContain('1,000');
    });

    it('should format distance in Nepali context', () => {
      expect(service.formatDistance(5)).toBe('5 km');
      expect(service.formatDistance(100)).toBe('100 km');
    });
  });

  describe('Curriculum Terminology', () => {
    it('should provide English curriculum terms', () => {
      expect(service.getCurriculumTerm('addition', 'en')).toBe('Addition');
      expect(service.getCurriculumTerm('geometry', 'en')).toBe('Geometry');
      expect(service.getCurriculumTerm('physics', 'en')).toBe('Physics');
    });

    it('should provide Nepali curriculum terms', () => {
      expect(service.getCurriculumTerm('addition', 'ne')).toBe('जोड');
      expect(service.getCurriculumTerm('subtraction', 'ne')).toBe('घटाउ');
      expect(service.getCurriculumTerm('geometry', 'ne')).toBe('ज्यामिति');
    });

    it('should handle missing curriculum terms', () => {
      expect(service.getCurriculumTerm('nonexistent', 'en')).toBe('nonexistent');
    });

    it('should get all curriculum terms for a language', () => {
      const englishTerms = service.getAllCurriculumTerms('en');
      expect(englishTerms.addition).toBe('Addition');
      expect(englishTerms.physics).toBe('Physics');

      const nepaliTerms = service.getAllCurriculumTerms('ne');
      expect(nepaliTerms.addition).toBe('जोड');
      expect(nepaliTerms.physics).toBe('भौतिक विज्ञान');
    });

    it('should validate terminology against Nepal curriculum', () => {
      expect(service.validateTerminology('Addition', 'en')).toBe(true);
      expect(service.validateTerminology('जोड', 'ne')).toBe(true);
      expect(service.validateTerminology('InvalidTerm', 'en')).toBe(false);
    });
  });

  describe('Content Validation', () => {
    it('should validate content with Nepali currency', () => {
      const content = 'Ram bought 5 apples for रू 100';
      const result = service.validateContent(content);
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect non-Nepali currency in content', () => {
      const content = 'Ram bought 5 apples for $10';
      const result = service.validateContent(content);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Content contains non-Nepali currency references');
      expect(result.suggestions[0]).toContain('रू');
    });

    it('should detect imperial units in content', () => {
      const content = 'The distance is 5 miles';
      const result = service.validateContent(content);
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('imperial unit'))).toBe(true);
      expect(result.suggestions.some(s => s.includes('metric'))).toBe(true);
    });

    it('should detect non-Nepali cultural contexts', () => {
      const content = 'We celebrate Christmas with family';
      const result = service.validateContent(content);
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('non-Nepali cultural context'))).toBe(true);
      expect(result.suggestions.some(s => s.includes('Dashain'))).toBe(true);
    });

    it('should validate content with metric units', () => {
      const content = 'The distance is 5 km and temperature is 25 celsius';
      const result = service.validateContent(content);
      expect(result.isValid).toBe(true);
    });

    it('should validate content with Nepali festivals', () => {
      const content = 'We celebrate Dashain and Tihar with family';
      const result = service.validateContent(content);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Nepali Examples', () => {
    it('should provide Nepali city examples', () => {
      const city = service.getNepaliExample('cities');
      expect(['Kathmandu', 'Pokhara', 'Lalitpur', 'Bhaktapur', 'Biratnagar', 'Birgunj']).toContain(city);
    });

    it('should provide Nepali river examples', () => {
      const rivers = service.getNepaliExamples('rivers');
      expect(rivers).toContain('Bagmati');
      expect(rivers).toContain('Koshi');
    });

    it('should provide Nepali mountain examples', () => {
      const mountains = service.getNepaliExamples('mountains');
      expect(mountains).toContain('Sagarmatha');
      expect(mountains).toContain('Kanchenjunga');
    });

    it('should provide Nepali festival examples', () => {
      const festivals = service.getNepaliExamples('festivals');
      expect(festivals).toContain('Dashain');
      expect(festivals).toContain('Tihar');
    });

    it('should provide Nepali food examples', () => {
      const foods = service.getNepaliExamples('foods');
      expect(foods).toContain('Dal Bhat');
      expect(foods).toContain('Momo');
    });

    it('should provide Nepali animal examples', () => {
      const animals = service.getNepaliExamples('animals');
      expect(animals).toContain('Yak');
      expect(animals).toContain('Red Panda');
    });

    it('should provide Nepali plant examples', () => {
      const plants = service.getNepaliExamples('plants');
      expect(plants).toContain('Rhododendron');
      expect(plants).toContain('Sal');
    });
  });

  describe('Context Suggestions', () => {
    it('should suggest Nepali cities for generic city references', () => {
      const suggestions = service.suggestNepaliContext('The city has many schools');
      expect(suggestions.some(s => s.includes('Kathmandu'))).toBe(true);
    });

    it('should suggest Nepali geography for geographic terms', () => {
      const suggestions = service.suggestNepaliContext('The river flows through the valley');
      expect(suggestions.some(s => s.includes('Bagmati'))).toBe(true);
    });

    it('should suggest Nepali festivals for celebration references', () => {
      const suggestions = service.suggestNepaliContext('During the festival, families gather');
      expect(suggestions.some(s => s.includes('Dashain'))).toBe(true);
    });

    it('should return empty array for content without context keywords', () => {
      const suggestions = service.suggestNepaliContext('The answer is 42');
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('Nepal K-12 Curriculum', () => {
    it('should provide grade levels for Nepal K-12', () => {
      const grades = service.getGradeLevels();
      expect(grades).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    it('should provide subjects in English', () => {
      const subjects = service.getSubjects('en');
      expect(subjects).toContain('Mathematics');
      expect(subjects).toContain('Science');
      expect(subjects).toContain('Nepali');
      expect(subjects).toContain('English');
      expect(subjects).toContain('Social Studies');
    });

    it('should provide subjects in Nepali', () => {
      const subjects = service.getSubjects('ne');
      expect(subjects).toContain('गणित');
      expect(subjects).toContain('विज्ञान');
      expect(subjects).toContain('नेपाली');
      expect(subjects).toContain('अंग्रेजी');
      expect(subjects).toContain('सामाजिक अध्ययन');
    });
  });

  describe('Multiple Currency Detection', () => {
    it('should detect USD references', () => {
      const result = service.validateContent('Price: $100 USD');
      expect(result.isValid).toBe(false);
    });

    it('should detect EUR references', () => {
      const result = service.validateContent('Price: €50 EUR');
      expect(result.isValid).toBe(false);
    });

    it('should detect INR references', () => {
      const result = service.validateContent('Price: ₹500 INR');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Multiple Imperial Units Detection', () => {
    it('should detect feet', () => {
      const result = service.validateContent('Height: 6 feet');
      expect(result.isValid).toBe(false);
    });

    it('should detect pounds', () => {
      const result = service.validateContent('Weight: 150 pounds');
      expect(result.isValid).toBe(false);
    });

    it('should detect fahrenheit', () => {
      const result = service.validateContent('Temperature: 75 fahrenheit');
      expect(result.isValid).toBe(false);
    });
  });
});
