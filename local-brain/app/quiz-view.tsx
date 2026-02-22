/**
 * Quiz View Screen - Interactive quiz with hints and feedback
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { QuizDisplay } from '@/src/components/QuizDisplay';
import { FeedbackDisplay, HintDisplay } from '@/src/components/FeedbackDisplay';
import { useApp } from '@/src/contexts/AppContext';
import { Quiz, Hint } from '@/src/models';
import { QuizFeedback } from '@/src/services';

export default function QuizViewScreen() {
  const router = useRouter();
  const { quizId } = useLocalSearchParams<{ quizId: string }>();
  const { contentService, performanceService, studentId } = useApp();
  
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [feedback, setFeedback] = useState<QuizFeedback | null>(null);
  const [currentHint, setCurrentHint] = useState<Hint | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (quizId && contentService && performanceService) {
      loadQuiz();
    }
  }, [quizId, contentService, performanceService]);

  const loadQuiz = async () => {
    try {
      const quizData = await contentService!.getQuizById(quizId);
      if (quizData) {
        setQuiz(quizData);
        
        // Track quiz start
        await performanceService!.trackEvent({
          studentId,
          timestamp: new Date(),
          eventType: 'quiz_start',
          contentId: quizId,
          subject: quizData.subject,
          topic: quizData.topic,
          data: {},
        });
      }
    } catch (error) {
      console.error('Error loading quiz:', error);
      Alert.alert('Error', 'Failed to load quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSubmit = async (questionId: string, answer: string) => {
    if (!quiz || !contentService || !performanceService) return;

    const currentQuestion = quiz.questions[currentQuestionIndex];
    
    try {
      // Validate answer
      const result = await contentService.validateAnswer(
        quizId,
        questionId,
        answer,
        hintsUsed
      );

      setFeedback(result);

      // Track answer
      await performanceService.trackEvent({
        studentId,
        timestamp: new Date(),
        eventType: 'quiz_answer',
        contentId: quizId,
        subject: quiz.subject,
        topic: quiz.topic,
        data: {
          answer,
          correct: result.correct,
          hintsUsed,
        },
      });

    } catch (error) {
      console.error('Error validating answer:', error);
      Alert.alert('Error', 'Failed to validate answer');
    }
  };

  const handleRequestHint = async () => {
    if (!quiz || !contentService) return;

    const currentQuestion = quiz.questions[currentQuestionIndex];
    const nextLevel = hintsUsed + 1;

    try {
      const hint = await contentService.getHint(quizId, currentQuestion.questionId, nextLevel);
      
      if (hint) {
        setCurrentHint(hint);
        setHintsUsed(nextLevel);

        // Track hint request
        await performanceService!.trackEvent({
          studentId,
          timestamp: new Date(),
          eventType: 'hint_requested',
          contentId: quizId,
          subject: quiz.subject,
          topic: quiz.topic,
          data: { hintsUsed: nextLevel },
        });
      }
    } catch (error) {
      console.error('Error getting hint:', error);
    }
  };

  const handleContinue = () => {
    if (!feedback || !quiz) return;

    if (feedback.correct) {
      // Move to next question
      if (currentQuestionIndex < quiz.questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setFeedback(null);
        setHintsUsed(0);
      } else {
        // Quiz complete
        handleQuizComplete();
      }
    } else {
      // Try again
      setFeedback(null);
    }
  };

  const handleQuizComplete = async () => {
    if (!quiz || !performanceService) return;

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    try {
      await performanceService.trackEvent({
        studentId,
        timestamp: new Date(),
        eventType: 'quiz_complete',
        contentId: quizId,
        subject: quiz.subject,
        topic: quiz.topic,
        data: { timeSpent },
      });

      Alert.alert(
        'Quiz Complete!',
        'Excellent work! Keep learning!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error completing quiz:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!quiz) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <QuizDisplay
        quiz={quiz}
        onAnswerSubmit={handleAnswerSubmit}
        currentQuestionIndex={currentQuestionIndex}
      />

      {/* Feedback Modal */}
      <Modal
        visible={feedback !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedback(null)}
      >
        {feedback && (
          <FeedbackDisplay
            feedback={feedback}
            onRequestHint={handleRequestHint}
            onContinue={handleContinue}
            showHintButton={!feedback.correct && hintsUsed < 3}
          />
        )}
      </Modal>

      {/* Hint Modal */}
      <Modal
        visible={currentHint !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrentHint(null)}
      >
        {currentHint && (
          <HintDisplay
            hintText={currentHint.text}
            level={currentHint.level}
            onClose={() => setCurrentHint(null)}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
