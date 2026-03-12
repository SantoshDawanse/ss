/**
 * Property-Based Testing Setup for Sync With Cloud Feature
 * 
 * This file provides custom arbitraries (generators) for property-based tests
 * using fast-check. These generators create random test data that conforms to
 * the domain models used in the sync-with-cloud feature.
 * 
 * Usage:
 *   import { performanceLogArbitrary, bundleDataArbitrary } from './pbt-setup';
 *   import fc from 'fast-check';
 * 
 *   fc.assert(fc.property(performanceLogArbitrary(), (log) => {
 *     // Your property test here
 *   }));
 */

import fc from 'fast-check';

/**
 * Property test configuration with minimum 100 iterations.
 */
export const propertyConfig: fc.Parameters<unknown> = {
  numRuns: 100,
  verbose: true,
  seed: Date.now(),
};

/**
 * Generate random UUIDs (v4 format).
 */
export const uuidArbitrary = () =>
  fc.uuid();

/**
 * Generate random ISO 8601 timestamps.
 */
export const isoTimestampArbitrary = () =>
  fc.date().map((d) => d.toISOString());

/**
 * Generate random Unix timestamps (milliseconds).
 */
export const unixTimestampArbitrary = () =>
  fc.date().map((d) => d.getTime());

/**
 * Generate random event types for performance logs.
 */
export const eventTypeArbitrary = () =>
  fc.constantFrom(
    'lesson_start',
    'lesson_complete',
    'quiz_start',
    'quiz_answer',
    'quiz_complete',
    'hint_requested'
  );

/**
 * Generate random subjects.
 */
export const subjectArbitrary = () =>
  fc.constantFrom('Mathematics', 'Science', 'English', 'Social Studies', 'Nepali');

/**
 * Generate random topics.
 */
export const topicArbitrary = () =>
  fc.string({ minLength: 3, maxLength: 50 });

/**
 * Generate random difficulty levels.
 */
export const difficultyArbitrary = () =>
  fc.constantFrom('easy', 'medium', 'hard');

/**
 * Generate random sync states.
 */
export const syncStateArbitrary = () =>
  fc.constantFrom(
    'idle',
    'checking_connectivity',
    'uploading',
    'downloading',
    'importing',
    'complete',
    'failed'
  );

/**
 * Generate random performance log data based on event type.
 */
export const performanceLogDataArbitrary = (eventType: string) => {
  switch (eventType) {
    case 'lesson_complete':
    case 'quiz_complete':
      return fc.record({
        timeSpent: fc.nat({ max: 3600 }),
        score: fc.option(fc.nat({ max: 100 })),
      });
    case 'quiz_answer':
      return fc.record({
        answer: fc.string({ minLength: 1, maxLength: 200 }),
        correct: fc.boolean(),
        hintsUsed: fc.nat({ max: 3 }),
      });
    case 'hint_requested':
      return fc.record({
        hintLevel: fc.integer({ min: 1, max: 3 }),
      });
    default:
      return fc.record({});
  }
};

/**
 * Generate random performance logs.
 */
export const performanceLogArbitrary = () =>
  fc
    .tuple(uuidArbitrary(), eventTypeArbitrary())
    .chain(([studentId, eventType]) =>
      fc.record({
        studentId: fc.constant(studentId),
        timestamp: unixTimestampArbitrary(),
        eventType: fc.constant(eventType),
        contentId: uuidArbitrary(),
        subject: subjectArbitrary(),
        topic: topicArbitrary(),
        data: performanceLogDataArbitrary(eventType),
      })
    );

/**
 * Generate random lesson sections.
 */
export const lessonSectionArbitrary = () =>
  fc.record({
    type: fc.constantFrom('explanation', 'example', 'practice'),
    content: fc.string({ minLength: 10, maxLength: 500 }),
    media: fc.option(
      fc.array(
        fc.record({
          type: fc.constantFrom('image', 'audio'),
          url: fc.webUrl(),
          alt: fc.option(fc.string({ maxLength: 100 })),
        }),
        { maxLength: 3 }
      )
    ),
  });

/**
 * Generate random lessons.
 */
export const lessonArbitrary = () =>
  fc.record({
    lesson_id: uuidArbitrary(),
    subject: subjectArbitrary(),
    topic: topicArbitrary(),
    title: fc.string({ minLength: 5, maxLength: 100 }),
    difficulty: difficultyArbitrary(),
    estimated_minutes: fc.nat({ min: 5, max: 120 }),
    curriculum_standards: fc.array(fc.string({ minLength: 10, maxLength: 50 }), {
      minLength: 1,
      maxLength: 5,
    }),
    sections: fc.array(lessonSectionArbitrary(), { minLength: 1, maxLength: 10 }),
  });

/**
 * Generate random quiz questions.
 */
export const questionArbitrary = () =>
  fc.record({
    question_id: uuidArbitrary(),
    type: fc.constantFrom('multiple_choice', 'true_false', 'short_answer'),
    question: fc.string({ minLength: 10, maxLength: 200 }),
    options: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 2, maxLength: 5 })),
    correct_answer: fc.string({ minLength: 1, maxLength: 100 }),
    explanation: fc.string({ minLength: 10, maxLength: 300 }),
    curriculum_standard: fc.string({ minLength: 10, maxLength: 50 }),
    bloom_level: fc.integer({ min: 1, max: 6 }),
  });

/**
 * Generate random quizzes.
 */
export const quizArbitrary = () =>
  fc.record({
    quiz_id: uuidArbitrary(),
    subject: subjectArbitrary(),
    topic: topicArbitrary(),
    title: fc.string({ minLength: 5, maxLength: 100 }),
    difficulty: difficultyArbitrary(),
    time_limit: fc.option(fc.nat({ min: 5, max: 60 })),
    questions: fc.array(questionArbitrary(), { minLength: 1, maxLength: 20 }),
  });

/**
 * Generate random hints.
 */
export const hintArbitrary = () =>
  fc.record({
    hint_id: uuidArbitrary(),
    quiz_id: uuidArbitrary(),
    question_id: uuidArbitrary(),
    level: fc.integer({ min: 1, max: 3 }),
    hint_text: fc.string({ minLength: 10, maxLength: 200 }),
  });

/**
 * Generate random study track weeks.
 */
export const weekPlanArbitrary = () =>
  fc.record({
    week_number: fc.nat({ min: 1, max: 52 }),
    topics: fc.array(topicArbitrary(), { minLength: 1, maxLength: 5 }),
    lesson_ids: fc.array(uuidArbitrary(), { minLength: 1, maxLength: 10 }),
    quiz_ids: fc.array(uuidArbitrary(), { minLength: 0, maxLength: 5 }),
    estimated_hours: fc.nat({ min: 1, max: 20 }),
  });

/**
 * Generate random study tracks.
 */
export const studyTrackArbitrary = () =>
  fc.record({
    track_id: uuidArbitrary(),
    subject: subjectArbitrary(),
    weeks: fc.array(weekPlanArbitrary(), { minLength: 1, maxLength: 12 }),
  });

/**
 * Generate random subject data.
 */
export const subjectDataArbitrary = () =>
  fc
    .tuple(subjectArbitrary(), fc.array(lessonArbitrary(), { minLength: 1, maxLength: 10 }))
    .chain(([subject, lessons]) =>
      fc.record({
        subject: fc.constant(subject),
        lessons: fc.constant(lessons),
        quizzes: fc.array(quizArbitrary(), { minLength: 1, maxLength: 10 }),
        hints: fc.dictionary(
          uuidArbitrary(),
          fc.array(hintArbitrary(), { minLength: 1, maxLength: 3 })
        ),
        study_track: fc.option(studyTrackArbitrary()),
      })
    );

/**
 * Generate random bundle data.
 */
export const bundleDataArbitrary = () =>
  fc.record({
    bundle_id: uuidArbitrary(),
    student_id: uuidArbitrary(),
    valid_from: isoTimestampArbitrary(),
    valid_until: isoTimestampArbitrary(),
    total_size: fc.nat({ min: 1000, max: 10_000_000 }),
    checksum: fc.hexaString({ minLength: 64, maxLength: 64 }),
    subjects: fc.array(subjectDataArbitrary(), { minLength: 1, maxLength: 5 }),
  });

/**
 * Generate random sync session data.
 */
export const syncSessionArbitrary = () =>
  fc.record({
    session_id: uuidArbitrary(),
    start_time: unixTimestampArbitrary(),
    end_time: fc.option(unixTimestampArbitrary()),
    status: syncStateArbitrary(),
    logs_uploaded: fc.nat({ max: 1000 }),
    bundle_downloaded: fc.boolean().map((b) => (b ? 1 : 0)),
    error_message: fc.option(fc.string({ maxLength: 200 })),
  });

/**
 * Generate random checksums (SHA-256 hex strings).
 */
export const checksumArbitrary = () =>
  fc.hexaString({ minLength: 64, maxLength: 64 });

/**
 * Generate random file sizes (in bytes).
 */
export const fileSizeArbitrary = () =>
  fc.nat({ min: 100, max: 10_000_000 });

/**
 * Generate random presigned URLs.
 */
export const presignedUrlArbitrary = () =>
  fc.webUrl({ validSchemes: ['https'] });

/**
 * Generate random download info responses.
 */
export const downloadInfoArbitrary = () =>
  fc.record({
    bundleUrl: presignedUrlArbitrary(),
    bundleSize: fileSizeArbitrary(),
    checksum: checksumArbitrary(),
    validUntil: isoTimestampArbitrary(),
  });

/**
 * Generate random upload responses.
 */
export const uploadResponseArbitrary = () =>
  fc.record({
    sessionId: uuidArbitrary(),
    logsReceived: fc.nat({ max: 1000 }),
    bundleReady: fc.boolean(),
  });

/**
 * Generate random retry delays (in milliseconds).
 */
export const retryDelayArbitrary = () =>
  fc.nat({ min: 0, max: 30000 });

/**
 * Generate random jitter values (0-1000ms).
 */
export const jitterArbitrary = () =>
  fc.nat({ min: 0, max: 1000 });

/**
 * Generate random progress percentages (0-100).
 */
export const progressArbitrary = () =>
  fc.nat({ min: 0, max: 100 });
