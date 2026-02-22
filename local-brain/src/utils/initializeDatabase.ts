/**
 * Database initialization utility
 * Loads sample data for development and testing
 */

import { DatabaseManager } from '../database/DatabaseManager';
import { sampleBundle, SAMPLE_STUDENT_ID } from './sampleData';

export async function initializeDatabase(dbManager: DatabaseManager): Promise<void> {
  try {
    console.log('Initializing database with sample data...');

    // Check if data already exists
    const existingBundle = await dbManager.learningBundleRepository.getActiveBundle(
      SAMPLE_STUDENT_ID
    );

    if (existingBundle) {
      console.log('Sample data already exists, skipping initialization');
      return;
    }

    // Insert learning bundle
    await dbManager.learningBundleRepository.insert(sampleBundle);
    console.log('Inserted learning bundle');

    // Insert lessons
    for (const subject of sampleBundle.subjects) {
      for (const lesson of subject.lessons) {
        await dbManager.lessonRepository.insert(lesson, sampleBundle.bundleId);
      }
      console.log(`Inserted ${subject.lessons.length} lessons for ${subject.subject}`);

      // Insert quizzes
      for (const quiz of subject.quizzes) {
        await dbManager.quizRepository.insert(quiz, sampleBundle.bundleId);
      }
      console.log(`Inserted ${subject.quizzes.length} quizzes for ${subject.subject}`);

      // Insert hints
      for (const quiz of subject.quizzes) {
        for (const question of quiz.questions) {
          const hints = subject.hints[question.questionId];
          if (hints) {
            for (const hint of hints) {
              await dbManager.hintRepository.insert(hint, quiz.quizId, question.questionId);
            }
          }
        }
      }
      console.log(`Inserted hints for ${subject.subject}`);

      // Insert study track
      await dbManager.studyTrackRepository.insert(subject.studyTrack, sampleBundle.bundleId);
      console.log(`Inserted study track for ${subject.subject}`);
    }

    // Initialize student state
    await dbManager.studentStateRepository.upsert({
      studentId: SAMPLE_STUDENT_ID,
      currentSubject: 'Mathematics',
      currentLessonId: undefined,
      lastActive: new Date(),
    });
    console.log('Initialized student state');

    console.log('Database initialization complete!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}
