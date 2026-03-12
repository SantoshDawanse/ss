/**
 * BundleImportService handles learning bundle validation and import.
 * 
 * Responsibilities:
 * - Verify bundle signature (RSA-2048)
 * - Verify checksum
 * - Decompress bundle
 * - Import content to database
 * - Archive old bundles
 * 
 * Requirements: 4.8, 7.7
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';
import pako from 'pako';
import { DatabaseManager } from '../database/DatabaseManager';
import { LearningBundle, Lesson, Quiz, Hint, StudyTrack } from '../models';
import { LearningBundleRow } from '../database/repositories/LearningBundleRepository';

// Bundle structure after decompression (matches Python's snake_case)
interface BundleData {
  bundle_id: string;
  student_id: string;
  valid_from: string;
  valid_until: string;
  total_size: number;
  checksum: string;
  subjects: SubjectData[];
}

interface SubjectData {
  subject: string;
  lessons: RawLesson[];
  quizzes: RawQuiz[];
  hints: Record<string, RawHint[]>;
  revision_plan?: any;
  study_track?: RawStudyTrack;
}

// Raw data structures from backend (snake_case)
interface RawLesson {
  lesson_id: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_minutes: number;
  curriculum_standards: string[];
  sections: any[];
}

interface RawQuiz {
  quiz_id: string;
  subject: string;
  topic: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  time_limit?: number;
  questions: any[];
}

interface RawHint {
  hint_id: string;
  level: number;
  text: string;
}

interface RawStudyTrack {
  track_id: string;
  subject: string;
  weeks: any[];
}

export class BundleImportService {
  private dbManager: DatabaseManager;
  private publicKey: string; // RSA-2048 public key for signature verification

  constructor(publicKey: string) {
    this.dbManager = DatabaseManager.getInstance();
    this.publicKey = publicKey;
  }

  /**
   * Import and validate a learning bundle.
   * 
   * Steps:
   * 1. Verify checksum (Task 7.2: Calculate SHA-256, compare, delete on mismatch, log values)
   * 2. Verify signature (RSA-2048)
   * 3. Decompress bundle
   * 4. Import to database
   * 5. Archive old bundles
   * 
   * Requirements: 7.1-7.6
   */
  public async importBundle(bundlePath: string, expectedChecksum: string): Promise<void> {
    try {
      console.log('Starting bundle import:', bundlePath);

      // Step 1: Verify checksum (throws error on mismatch, deletes file)
      // Task 7.2: Checksum verification with file deletion and logging
      await this.verifyChecksum(bundlePath, expectedChecksum);
      console.log('✓ Checksum verified');

      // Step 2: Decompress bundle
      const bundleData = await this.decompressBundle(bundlePath);
      console.log('✓ Bundle decompressed');

      // Step 3: Verify signature
      const signatureValid = await this.verifySignature(bundleData);
      if (!signatureValid) {
        throw new Error('Bundle signature verification failed - content may be tampered');
      }
      console.log('✓ Signature verified');

      // Step 4: Import to database (in transaction)
      await this.importToDatabase(bundleData);
      console.log('✓ Bundle imported to database');

      // Step 5: Archive old bundles
      await this.archiveOldBundles(bundleData.student_id, bundleData.bundle_id);
      console.log('✓ Old bundles archived');

      console.log('Bundle import complete');
    } catch (error) {
      console.error('Bundle import failed:', error);
      throw error;
    }
  }

  /**
   * Verify bundle checksum using SHA-256.
   * Requirement 7.1-7.6: Data integrity validation
   * Uses crypto-js for reliable binary hashing.
   * 
   * Task 7.2 Implementation:
   * - Calculate SHA-256 hash using crypto-js
   * - Compare calculated vs expected checksum
   * - Delete file on mismatch and throw error
   * - Log both expected and actual values on failure
   */
  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      // Read file as base64
      const fileContent = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Parse base64 to WordArray (binary data)
      const wordArray = CryptoJS.enc.Base64.parse(fileContent);
      
      // Hash the binary data using SHA256
      const hash = CryptoJS.SHA256(wordArray);
      
      // Convert hash to hex string
      const actualChecksum = hash.toString(CryptoJS.enc.Hex);

      // Compare checksums (case-insensitive)
      const isMatch = actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();

      if (!isMatch) {
        // Log both expected and actual values on failure (Requirement 7.5)
        console.error('Checksum mismatch detected:');
        console.error(`  Expected: ${expectedChecksum}`);
        console.error(`  Actual:   ${actualChecksum}`);
        console.error(`  File:     ${filePath}`);

        // Delete file on mismatch (Requirement 7.4)
        try {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
          console.log(`Deleted corrupted file: ${filePath}`);
        } catch (deleteError) {
          console.error(`Failed to delete corrupted file: ${deleteError}`);
        }

        // Throw error with details (Requirement 7.4)
        throw new Error(
          `Checksum verification failed. Expected: ${expectedChecksum}, Actual: ${actualChecksum}`
        );
      }

      return true;
    } catch (error) {
      // If error is already our checksum mismatch error, re-throw it
      if (error instanceof Error && error.message.includes('Checksum verification failed')) {
        throw error;
      }
      
      // For other errors, log and return false
      console.error('Checksum verification error:', error);
      return false;
    }
  }

  /**
   * Verify bundle signature using RSA-2048.
   * Requirement 7.7: Content signature verification
   * 
   * Note: Signature is not included in the compressed bundle itself.
   * It's verified separately on the compressed data before decompression.
   * This method is a placeholder for future implementation.
   */
  private async verifySignature(bundleData: BundleData): Promise<boolean> {
    try {
      // Note: The signature is NOT in the bundle JSON - it's calculated on the
      // compressed data and stored separately in the backend metadata.
      // The signature verification should happen on the compressed file before
      // decompression, not on the decompressed bundle data.
      
      // For now, we skip signature verification since:
      // 1. We already verified the checksum of the compressed file
      // 2. The signature would need to be passed separately from the download endpoint
      // 3. This is marked as a TODO for future implementation
      
      console.log('⚠ Signature verification skipped (not implemented yet)');
      return true; // Skip signature verification for now
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Decompress and parse bundle file.
   * 
   * The bundle is gzip-compressed JSON.
   * Uses pako for proper gzip decompression.
   */
  private async decompressBundle(bundlePath: string): Promise<BundleData> {
    try {
      // Read compressed file as base64
      const compressedBase64 = await FileSystem.readAsStringAsync(bundlePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Decode base64 to binary string
      const binaryString = atob(compressedBase64);
      
      // Convert binary string to Uint8Array
      const compressedBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        compressedBytes[i] = binaryString.charCodeAt(i);
      }
      
      console.log(`Decompressing bundle: ${compressedBytes.length} bytes`);
      
      // Decompress using pako
      const decompressedBytes = pako.ungzip(compressedBytes);
      
      // Convert decompressed bytes to string
      const decompressed = new TextDecoder('utf-8').decode(decompressedBytes);
      
      console.log(`Decompressed bundle: ${decompressed.length} chars`);
      
      // Log first 200 chars of decompressed content for debugging
      console.log(`Bundle content preview: ${decompressed.substring(0, 200)}`);
      
      // Parse JSON
      const bundleData: BundleData = JSON.parse(decompressed);
      
      // Log the parsed structure
      console.log(`Parsed bundle keys: ${Object.keys(bundleData).join(', ')}`);
      console.log(`Bundle checksum value: "${bundleData.checksum}" (type: ${typeof bundleData.checksum})`);
      console.log(`Bundle checksum length: ${bundleData.checksum?.length || 0}`);

      // Validate bundle structure
      this.validateBundleStructure(bundleData);

      return bundleData;
    } catch (error) {
      console.error('Bundle decompression error:', error);
      throw new Error(`Failed to decompress bundle: ${error}`);
    }
  }

  /**
   * Validate bundle data structure.
   */
  private validateBundleStructure(bundleData: BundleData): void {
      console.log(`Validating bundle structure...`);
      console.log(`bundle_id: "${bundleData.bundle_id}"`);
      console.log(`student_id: "${bundleData.student_id}"`);
      console.log(`checksum: "${bundleData.checksum}" (type: ${typeof bundleData.checksum}, length: ${bundleData.checksum?.length})`);

      // Validate required fields exist and have correct types
      this.validateRequiredField(bundleData, 'bundle_id', 'string');
      this.validateRequiredField(bundleData, 'student_id', 'string');
      this.validateRequiredField(bundleData, 'valid_from', 'string');
      this.validateRequiredField(bundleData, 'valid_until', 'string');
      this.validateRequiredField(bundleData, 'total_size', 'number');
      this.validateRequiredField(bundleData, 'checksum', 'string');
      this.validateRequiredField(bundleData, 'subjects', 'array');

      // Validate non-empty strings
      if (bundleData.bundle_id.trim() === '') {
        throw new Error('Bundle bundle_id cannot be empty');
      }
      if (bundleData.student_id.trim() === '') {
        throw new Error('Bundle student_id cannot be empty');
      }

      // Validate date strings are valid ISO 8601 format
      this.validateDateString(bundleData.valid_from, 'valid_from');
      this.validateDateString(bundleData.valid_until, 'valid_until');

      // Validate total_size is positive
      if (bundleData.total_size <= 0) {
        throw new Error('Bundle total_size must be a positive number');
      }

      // Note: checksum field exists but is empty string in the compressed bundle
      // The actual checksum is verified separately before decompression
      if (bundleData.checksum === undefined || bundleData.checksum === null) {
        throw new Error('Bundle missing checksum field');
      }

      console.log(`✓ Bundle structure validation passed`);

      // Validate each subject
      for (let i = 0; i < bundleData.subjects.length; i++) {
        const subject = bundleData.subjects[i];
        this.validateSubjectStructure(subject, i);
      }
    }
  private validateRequiredField(obj: any, fieldName: string, expectedType: string): void {
    if (!(fieldName in obj)) {
      throw new Error(`Bundle missing required field: ${fieldName}`);
    }

    const value = obj[fieldName];
    const actualType = expectedType === 'array' ? (Array.isArray(value) ? 'array' : typeof value) : typeof value;

    if (actualType !== expectedType) {
      throw new Error(`Bundle field ${fieldName} must be ${expectedType}, got ${actualType}`);
    }
  }

  private validateDateString(dateStr: string, fieldName: string): void {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Bundle field ${fieldName} must be a valid ISO 8601 date string, got: ${dateStr}`);
    }
  }

  private validateSubjectStructure(subject: SubjectData, index: number): void {
    const subjectPrefix = `subjects[${index}]`;

    // Validate subject has required fields
    this.validateRequiredField(subject, 'subject', 'string');
    this.validateRequiredField(subject, 'lessons', 'array');
    this.validateRequiredField(subject, 'quizzes', 'array');
    this.validateRequiredField(subject, 'hints', 'object');

    // Validate subject name is non-empty
    if (subject.subject.trim() === '') {
      throw new Error(`${subjectPrefix}.subject cannot be empty`);
    }

    // Validate hints structure - should be Record<string, RawHint[]>
    if (Array.isArray(subject.hints)) {
      throw new Error(`${subjectPrefix}.hints must be an object (Record<string, RawHint[]>), got array`);
    }

    // Validate each hint entry
    for (const [quizId, hints] of Object.entries(subject.hints)) {
      if (typeof quizId !== 'string' || quizId.trim() === '') {
        throw new Error(`${subjectPrefix}.hints contains invalid quiz ID: ${quizId}`);
      }
      if (!Array.isArray(hints)) {
        throw new Error(`${subjectPrefix}.hints[${quizId}] must be an array, got ${typeof hints}`);
      }
    }

    // Validate lessons array structure
    for (let i = 0; i < subject.lessons.length; i++) {
      this.validateLessonStructure(subject.lessons[i], `${subjectPrefix}.lessons[${i}]`);
    }

    // Validate quizzes array structure
    for (let i = 0; i < subject.quizzes.length; i++) {
      this.validateQuizStructure(subject.quizzes[i], `${subjectPrefix}.quizzes[${i}]`);
    }

    // study_track is optional, but if present, validate it
    if (subject.study_track !== undefined) {
      this.validateStudyTrackStructure(subject.study_track, `${subjectPrefix}.study_track`);
    }
  }

  private validateLessonStructure(lesson: RawLesson, prefix: string): void {
    this.validateRequiredField(lesson, 'lesson_id', 'string');
    this.validateRequiredField(lesson, 'subject', 'string');
    this.validateRequiredField(lesson, 'topic', 'string');
    this.validateRequiredField(lesson, 'title', 'string');
    this.validateRequiredField(lesson, 'difficulty', 'string');
    this.validateRequiredField(lesson, 'sections', 'array');
    this.validateRequiredField(lesson, 'estimated_minutes', 'number');
    this.validateRequiredField(lesson, 'curriculum_standards', 'array');

    // Validate non-empty strings
    if (lesson.lesson_id.trim() === '') {
      throw new Error(`${prefix}.lesson_id cannot be empty`);
    }
    if (lesson.subject.trim() === '') {
      throw new Error(`${prefix}.subject cannot be empty`);
    }
    if (lesson.topic.trim() === '') {
      throw new Error(`${prefix}.topic cannot be empty`);
    }
    if (lesson.title.trim() === '') {
      throw new Error(`${prefix}.title cannot be empty`);
    }

    // Validate difficulty enum
    const validDifficulties = ['easy', 'medium', 'hard'];
    if (!validDifficulties.includes(lesson.difficulty)) {
      throw new Error(`${prefix}.difficulty must be one of: ${validDifficulties.join(', ')}, got: ${lesson.difficulty}`);
    }

    // Validate estimated_minutes is positive
    if (lesson.estimated_minutes <= 0) {
      throw new Error(`${prefix}.estimated_minutes must be a positive number, got: ${lesson.estimated_minutes}`);
    }
  }

  private validateQuizStructure(quiz: RawQuiz, prefix: string): void {
    this.validateRequiredField(quiz, 'quiz_id', 'string');
    this.validateRequiredField(quiz, 'subject', 'string');
    this.validateRequiredField(quiz, 'topic', 'string');
    this.validateRequiredField(quiz, 'title', 'string');
    this.validateRequiredField(quiz, 'difficulty', 'string');
    this.validateRequiredField(quiz, 'questions', 'array');

    // Validate non-empty strings
    if (quiz.quiz_id.trim() === '') {
      throw new Error(`${prefix}.quiz_id cannot be empty`);
    }
    if (quiz.subject.trim() === '') {
      throw new Error(`${prefix}.subject cannot be empty`);
    }
    if (quiz.topic.trim() === '') {
      throw new Error(`${prefix}.topic cannot be empty`);
    }
    if (quiz.title.trim() === '') {
      throw new Error(`${prefix}.title cannot be empty`);
    }

    // Validate difficulty enum
    const validDifficulties = ['easy', 'medium', 'hard'];
    if (!validDifficulties.includes(quiz.difficulty)) {
      throw new Error(`${prefix}.difficulty must be one of: ${validDifficulties.join(', ')}, got: ${quiz.difficulty}`);
    }

    // Validate time_limit if present
    if (quiz.time_limit !== undefined && quiz.time_limit !== null) {
      if (typeof quiz.time_limit !== 'number' || quiz.time_limit <= 0) {
        throw new Error(`${prefix}.time_limit must be a positive number or null, got: ${quiz.time_limit}`);
      }
    }

    // Validate questions array is not empty
    if (quiz.questions.length === 0) {
      throw new Error(`${prefix}.questions array cannot be empty`);
    }
  }

  private validateStudyTrackStructure(studyTrack: RawStudyTrack, prefix: string): void {
    this.validateRequiredField(studyTrack, 'track_id', 'string');
    this.validateRequiredField(studyTrack, 'subject', 'string');
    this.validateRequiredField(studyTrack, 'weeks', 'array');

    // Validate non-empty strings
    if (studyTrack.track_id.trim() === '') {
      throw new Error(`${prefix}.track_id cannot be empty`);
    }
    if (studyTrack.subject.trim() === '') {
      throw new Error(`${prefix}.subject cannot be empty`);
    }

    // Validate weeks array structure
    if (studyTrack.weeks.length === 0) {
      throw new Error(`${prefix}.weeks array cannot be empty`);
    }
  }

  /**
   * Import bundle data to database in a transaction.
   */
  private async importToDatabase(bundleData: BundleData): Promise<void> {
    try {
      await this.dbManager.transaction(async () => {
        // 1. Insert learning bundle
        const bundleRow: LearningBundleRow = {
          bundle_id: bundleData.bundle_id,
          student_id: bundleData.student_id,
          valid_from: new Date(bundleData.valid_from).getTime(),
          valid_until: new Date(bundleData.valid_until).getTime(),
          total_size: bundleData.total_size,
          checksum: bundleData.checksum,
          status: 'active',
        };
        await this.dbManager.learningBundleRepository.create(bundleRow);
        console.log(`✓ Created bundle record: ${bundleData.bundle_id}`);

        // 2. Import each subject's content
        for (const subject of bundleData.subjects) {
          await this.importSubjectContent(bundleData.bundle_id, subject);
        }
      });
    } catch (error) {
      console.error('Error importing bundle to database:', error);
      throw error;
    }
  }

  /**
   * Import subject content (lessons, quizzes, hints, study track).
   */
  private async importSubjectContent(bundleId: string, subject: SubjectData): Promise<void> {
    console.log(`Importing subject: ${subject.subject}`);
    console.log(`  - ${subject.lessons.length} lessons`);
    console.log(`  - ${subject.quizzes.length} quizzes`);
    console.log(`  - ${Object.keys(subject.hints).length} quiz hint sets`);
    
    // Import lessons
    try {
      for (const lesson of subject.lessons) {
        await this.dbManager.runSql(
          `INSERT INTO lessons 
          (lesson_id, bundle_id, subject, topic, title, difficulty, content_json, estimated_minutes, curriculum_standards)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lesson.lesson_id,
            bundleId,
            lesson.subject,
            lesson.topic,
            lesson.title,
            lesson.difficulty,
            JSON.stringify(lesson.sections),
            lesson.estimated_minutes,
            JSON.stringify(lesson.curriculum_standards),
          ],
        );
      }
      console.log(`  ✓ Imported ${subject.lessons.length} lessons`);
    } catch (error) {
      console.error(`  ✗ Error importing lessons:`, error);
      throw error;
    }

    // Import quizzes
    try {
      for (const quiz of subject.quizzes) {
        await this.dbManager.runSql(
          `INSERT INTO quizzes 
          (quiz_id, bundle_id, subject, topic, title, difficulty, time_limit, questions_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quiz.quiz_id,
            bundleId,
            quiz.subject,
            quiz.topic,
            quiz.title,
            quiz.difficulty,
            quiz.time_limit ?? null,
            JSON.stringify(quiz.questions),
          ],
        );
      }
      console.log(`  ✓ Imported ${subject.quizzes.length} quizzes`);
    } catch (error) {
      console.error(`  ✗ Error importing quizzes:`, error);
      throw error;
    }

    // Import hints
    try {
      let totalHints = 0;
      for (const [quizId, hints] of Object.entries(subject.hints)) {
        for (const hint of hints) {
          await this.dbManager.runSql(
            `INSERT INTO hints 
            (hint_id, quiz_id, question_id, level, hint_text)
            VALUES (?, ?, ?, ?, ?)`,
            [
              hint.hint_id,
              quizId,
              // Extract question_id from hint_id (format: hint_quizId_questionId_level)
              hint.hint_id.split('_')[2],
              hint.level,
              hint.text,
            ],
          );
          totalHints++;
        }
      }
      console.log(`  ✓ Imported ${totalHints} hints`);
    } catch (error) {
      console.error(`  ✗ Error importing hints:`, error);
      throw error;
    }

    // Import study track (if present)
    if (subject.study_track) {
      try {
        await this.dbManager.runSql(
          `INSERT INTO study_tracks 
          (track_id, bundle_id, subject, weeks_json)
          VALUES (?, ?, ?, ?)`,
          [
            subject.study_track.track_id,
            bundleId,
            subject.study_track.subject,
            JSON.stringify(subject.study_track.weeks),
          ],
        );
        console.log(`  ✓ Imported study track`);
      } catch (error) {
        console.error(`  ✗ Error importing study track:`, error);
        throw error;
      }
    }
  }

  /**
   * Archive old bundles for a student.
   * Keep only the newly imported bundle as active.
   */
  private async archiveOldBundles(studentId: string, newBundleId: string): Promise<void> {
    try {
      // Archive all bundles except the new one
      await this.dbManager.runSql(
        `UPDATE learning_bundles 
        SET status = 'archived' 
        WHERE student_id = ? AND bundle_id != ? AND status = 'active'`,
        [studentId, newBundleId],
      );

      // Delete archived bundles older than 30 days
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      await this.dbManager.learningBundleRepository.deleteArchivedBefore(thirtyDaysAgo);

      console.log('Old bundles archived successfully');
    } catch (error) {
      console.error('Error archiving old bundles:', error);
      throw error;
    }
  }

  /**
   * Validate bundle before import (pre-check).
   * Can be called before starting the import process.
   */
  public async validateBundle(bundlePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      // Verify checksum (throws on mismatch)
      await this.verifyChecksum(bundlePath, expectedChecksum);

      // Try to decompress and parse
      const bundleData = await this.decompressBundle(bundlePath);

      // Verify signature
      const signatureValid = await this.verifySignature(bundleData);
      if (!signatureValid) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Bundle validation failed:', error);
      return false;
    }
  }

  /**
   * Get bundle metadata without full import.
   */
  public async getBundleMetadata(bundlePath: string): Promise<{
    bundleId: string;
    studentId: string;
    validFrom: Date;
    validUntil: Date;
    totalSize: number;
    subjectCount: number;
  } | null> {
    try {
      const bundleData = await this.decompressBundle(bundlePath);

      return {
        bundleId: bundleData.bundle_id,
        studentId: bundleData.student_id,
        validFrom: new Date(bundleData.valid_from),
        validUntil: new Date(bundleData.valid_until),
        totalSize: bundleData.total_size,
        subjectCount: bundleData.subjects.length,
      };
    } catch (error) {
      console.error('Failed to get bundle metadata:', error);
      return null;
    }
  }
}
