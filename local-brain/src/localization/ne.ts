/**
 * Nepali Translations (Devanagari Script)
 */

import { LocalizationStrings } from '../types/localization';

export const ne: LocalizationStrings = {
  common: {
    ok: 'ठीक छ',
    cancel: 'रद्द गर्नुहोस्',
    save: 'सुरक्षित गर्नुहोस्',
    delete: 'मेटाउनुहोस्',
    edit: 'सम्पादन गर्नुहोस्',
    back: 'पछाडि',
    next: 'अर्को',
    previous: 'अघिल्लो',
    loading: 'लोड हुँदैछ...',
    error: 'त्रुटि',
    success: 'सफल',
    retry: 'पुन: प्रयास गर्नुहोस्',
  },

  navigation: {
    home: 'गृह',
    lessons: 'पाठहरू',
    quizzes: 'प्रश्नोत्तरी',
    progress: 'प्रगति',
    settings: 'सेटिङहरू',
  },

  lessons: {
    title: 'पाठहरू',
    startLesson: 'पाठ सुरु गर्नुहोस्',
    continueLesson: 'पाठ जारी राख्नुहोस्',
    completeLesson: 'पाठ पूरा गर्नुहोस्',
    lessonCompleted: 'पाठ पूरा भयो!',
    timeSpent: 'समय खर्च',
    estimatedTime: 'अनुमानित समय',
    noLessonsAvailable: 'कुनै पाठ उपलब्ध छैन। कृपया नयाँ सामग्री डाउनलोड गर्न सिंक गर्नुहोस्।',
    syncRequired: 'सिंक आवश्यक छ',
  },

  quizzes: {
    title: 'प्रश्नोत्तरी',
    startQuiz: 'प्रश्नोत्तरी सुरु गर्नुहोस्',
    submitAnswer: 'उत्तर पेश गर्नुहोस्',
    nextQuestion: 'अर्को प्रश्न',
    previousQuestion: 'अघिल्लो प्रश्न',
    showHint: 'संकेत देखाउनुहोस्',
    correct: 'सही!',
    incorrect: 'गलत',
    score: 'अंक',
    questionsAnswered: 'उत्तर दिइएका प्रश्नहरू',
    quizCompleted: 'प्रश्नोत्तरी पूरा भयो!',
    noQuizzesAvailable: 'कुनै प्रश्नोत्तरी उपलब्ध छैन। कृपया नयाँ सामग्री डाउनलोड गर्न सिंक गर्नुहोस्।',
  },

  progress: {
    title: 'प्रगति',
    overallProgress: 'समग्र प्रगति',
    subjectProgress: 'विषय प्रगति',
    lessonsCompleted: 'पूरा भएका पाठहरू',
    quizzesCompleted: 'पूरा भएका प्रश्नोत्तरी',
    averageAccuracy: 'औसत शुद्धता',
    timeSpent: 'समय खर्च',
    currentStreak: 'हालको लगातार',
    days: 'दिन',
  },

  settings: {
    title: 'सेटिङहरू',
    language: 'भाषा',
    textSize: 'पाठ आकार',
    simplifiedUI: 'सरलीकृत UI',
    textToSpeech: 'पाठ-देखि-बोली',
    sync: 'सिंक',
    syncNow: 'अहिले सिंक गर्नुहोस्',
    lastSync: 'अन्तिम सिंक',
    about: 'बारेमा',
  },

  subjects: {
    mathematics: 'गणित',
    science: 'विज्ञान',
    nepali: 'नेपाली',
    english: 'अंग्रेजी',
    socialStudies: 'सामाजिक अध्ययन',
  },

  difficulty: {
    easy: 'सजिलो',
    medium: 'मध्यम',
    hard: 'गाह्रो',
  },

  accessibility: {
    textSizeSmall: 'सानो',
    textSizeMedium: 'मध्यम',
    textSizeLarge: 'ठूलो',
    textSizeExtraLarge: 'अति ठूलो',
    simplifiedUIEnabled: 'सरलीकृत UI सक्षम',
    simplifiedUIDisabled: 'सरलीकृत UI असक्षम',
    ttsEnabled: 'पाठ-देखि-बोली सक्षम',
    ttsDisabled: 'पाठ-देखि-बोली असक्षम',
    readAloud: 'ठूलो स्वरमा पढ्नुहोस्',
    stopReading: 'पढ्न रोक्नुहोस्',
  },
};
