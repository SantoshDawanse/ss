/**
 * Localization Types
 */

export type Language = 'en' | 'ne';

export interface LocalizationStrings {
  // Common
  common: {
    ok: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    back: string;
    next: string;
    previous: string;
    loading: string;
    error: string;
    success: string;
    retry: string;
  };

  // Navigation
  navigation: {
    home: string;
    lessons: string;
    quizzes: string;
    progress: string;
    settings: string;
  };

  // Lessons
  lessons: {
    title: string;
    startLesson: string;
    continueLesson: string;
    completeLesson: string;
    lessonCompleted: string;
    timeSpent: string;
    estimatedTime: string;
    noLessonsAvailable: string;
    syncRequired: string;
  };

  // Quizzes
  quizzes: {
    title: string;
    startQuiz: string;
    submitAnswer: string;
    nextQuestion: string;
    previousQuestion: string;
    showHint: string;
    correct: string;
    incorrect: string;
    score: string;
    questionsAnswered: string;
    quizCompleted: string;
    noQuizzesAvailable: string;
  };

  // Progress
  progress: {
    title: string;
    overallProgress: string;
    subjectProgress: string;
    lessonsCompleted: string;
    quizzesCompleted: string;
    averageAccuracy: string;
    timeSpent: string;
    currentStreak: string;
    days: string;
  };

  // Settings
  settings: {
    title: string;
    language: string;
    textSize: string;
    simplifiedUI: string;
    textToSpeech: string;
    sync: string;
    syncNow: string;
    lastSync: string;
    about: string;
  };

  // Subjects
  subjects: {
    mathematics: string;
    science: string;
    nepali: string;
    english: string;
    socialStudies: string;
  };

  // Difficulty
  difficulty: {
    easy: string;
    medium: string;
    hard: string;
  };

  // Accessibility
  accessibility: {
    textSizeSmall: string;
    textSizeMedium: string;
    textSizeLarge: string;
    textSizeExtraLarge: string;
    simplifiedUIEnabled: string;
    simplifiedUIDisabled: string;
    ttsEnabled: string;
    ttsDisabled: string;
    readAloud: string;
    stopReading: string;
  };
}
