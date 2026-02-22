/**
 * English Translations
 */

import { LocalizationStrings } from '../types/localization';

export const en: LocalizationStrings = {
  common: {
    ok: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    retry: 'Retry',
  },

  navigation: {
    home: 'Home',
    lessons: 'Lessons',
    quizzes: 'Quizzes',
    progress: 'Progress',
    settings: 'Settings',
  },

  lessons: {
    title: 'Lessons',
    startLesson: 'Start Lesson',
    continueLesson: 'Continue Lesson',
    completeLesson: 'Complete Lesson',
    lessonCompleted: 'Lesson Completed!',
    timeSpent: 'Time Spent',
    estimatedTime: 'Estimated Time',
    noLessonsAvailable: 'No lessons available. Please sync to download new content.',
    syncRequired: 'Sync Required',
  },

  quizzes: {
    title: 'Quizzes',
    startQuiz: 'Start Quiz',
    submitAnswer: 'Submit Answer',
    nextQuestion: 'Next Question',
    previousQuestion: 'Previous Question',
    showHint: 'Show Hint',
    correct: 'Correct!',
    incorrect: 'Incorrect',
    score: 'Score',
    questionsAnswered: 'Questions Answered',
    quizCompleted: 'Quiz Completed!',
    noQuizzesAvailable: 'No quizzes available. Please sync to download new content.',
  },

  progress: {
    title: 'Progress',
    overallProgress: 'Overall Progress',
    subjectProgress: 'Subject Progress',
    lessonsCompleted: 'Lessons Completed',
    quizzesCompleted: 'Quizzes Completed',
    averageAccuracy: 'Average Accuracy',
    timeSpent: 'Time Spent',
    currentStreak: 'Current Streak',
    days: 'days',
  },

  settings: {
    title: 'Settings',
    language: 'Language',
    textSize: 'Text Size',
    simplifiedUI: 'Simplified UI',
    textToSpeech: 'Text-to-Speech',
    sync: 'Sync',
    syncNow: 'Sync Now',
    lastSync: 'Last Sync',
    about: 'About',
  },

  subjects: {
    mathematics: 'Mathematics',
    science: 'Science',
    nepali: 'Nepali',
    english: 'English',
    socialStudies: 'Social Studies',
  },

  difficulty: {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
  },

  accessibility: {
    textSizeSmall: 'Small',
    textSizeMedium: 'Medium',
    textSizeLarge: 'Large',
    textSizeExtraLarge: 'Extra Large',
    simplifiedUIEnabled: 'Simplified UI Enabled',
    simplifiedUIDisabled: 'Simplified UI Disabled',
    ttsEnabled: 'Text-to-Speech Enabled',
    ttsDisabled: 'Text-to-Speech Disabled',
    readAloud: 'Read Aloud',
    stopReading: 'Stop Reading',
  },
};
