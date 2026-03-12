/**
 * Test to verify the fix for "TypeError: right operand of 'in' is not an object"
 * This test specifically targets the issue in the original error logs.
 */

import { BundleImportService } from '../src/services/BundleImportService';

describe('BundleImportService - Validation Fix', () => {
  let service: BundleImportService;
  const mockPublicKey = 'mock-public-key';

  beforeEach(() => {
    service = new BundleImportService(mockPublicKey);
  });

  describe('validateRequiredField method', () => {
    it('should handle null objects gracefully', () => {
      // Access the private method for testing
      const validateRequiredField = (service as any).validateRequiredField.bind(service);

      expect(() => {
        validateRequiredField(null, 'field', 'string');
      }).toThrow('Cannot validate field field: object is null');
    });

    it('should handle undefined objects gracefully', () => {
      const validateRequiredField = (service as any).validateRequiredField.bind(service);

      expect(() => {
        validateRequiredField(undefined, 'field', 'string');
      }).toThrow('Cannot validate field field: object is undefined');
    });

    it('should handle non-object values gracefully', () => {
      const validateRequiredField = (service as any).validateRequiredField.bind(service);

      expect(() => {
        validateRequiredField('string', 'field', 'string');
      }).toThrow('Cannot validate field field: object is string');

      expect(() => {
        validateRequiredField(123, 'field', 'string');
      }).toThrow('Cannot validate field field: object is number');
    });

    it('should work correctly with valid objects', () => {
      const validateRequiredField = (service as any).validateRequiredField.bind(service);

      const validObject = { field: 'value' };
      
      // Should not throw
      expect(() => {
        validateRequiredField(validObject, 'field', 'string');
      }).not.toThrow();
    });

    it('should throw for missing fields in valid objects', () => {
      const validateRequiredField = (service as any).validateRequiredField.bind(service);

      const validObject = { otherField: 'value' };
      
      expect(() => {
        validateRequiredField(validObject, 'field', 'string');
      }).toThrow('Bundle missing required field: field');
    });
  });

  describe('validateSubjectStructure method', () => {
    it('should handle null study_track gracefully', () => {
      const validateSubjectStructure = (service as any).validateSubjectStructure.bind(service);

      const subjectWithNullStudyTrack = {
        subject: 'Math',
        lessons: [],
        quizzes: [],
        hints: {},
        study_track: null
      };

      // Should not throw the "right operand of 'in' is not an object" error
      expect(() => {
        validateSubjectStructure(subjectWithNullStudyTrack, 0);
      }).not.toThrow('right operand of \'in\' is not an object');
    });

    it('should handle undefined study_track gracefully', () => {
      const validateSubjectStructure = (service as any).validateSubjectStructure.bind(service);

      const subjectWithUndefinedStudyTrack = {
        subject: 'Math',
        lessons: [],
        quizzes: [],
        hints: {}
        // study_track is undefined (not present)
      };

      // Should not throw the "right operand of 'in' is not an object" error
      expect(() => {
        validateSubjectStructure(subjectWithUndefinedStudyTrack, 0);
      }).not.toThrow('right operand of \'in\' is not an object');
    });

    it('should handle non-object study_track gracefully', () => {
      const validateSubjectStructure = (service as any).validateSubjectStructure.bind(service);

      const subjectWithStringStudyTrack = {
        subject: 'Math',
        lessons: [],
        quizzes: [],
        hints: {},
        study_track: 'invalid'
      };

      // Should throw a descriptive error, not the "right operand of 'in' is not an object" error
      expect(() => {
        validateSubjectStructure(subjectWithStringStudyTrack, 0);
      }).toThrow('subjects[0].study_track must be an object, got string');
    });

    it('should work correctly with valid study_track', () => {
      const validateSubjectStructure = (service as any).validateSubjectStructure.bind(service);

      const subjectWithValidStudyTrack = {
        subject: 'Math',
        lessons: [],
        quizzes: [],
        hints: {},
        study_track: {
          track_id: 'track-1',
          subject: 'Math',
          weeks: [
            {
              week: 1,
              days: [
                { day: 1, lesson_ids: [], quiz_ids: [] }
              ]
            }
          ]
        }
      };

      // Should not throw
      expect(() => {
        validateSubjectStructure(subjectWithValidStudyTrack, 0);
      }).not.toThrow();
    });
  });
});