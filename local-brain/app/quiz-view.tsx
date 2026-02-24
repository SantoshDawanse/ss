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
    if (quizId && contentService && performanceService && studentId) {
      loadQuiz();
    }
  }, [quizId, contentService, performanceService, studentId]);

  const loadQuiz = async () => {
    if (!studentId) return;
    
    try {
      const quizData = await contentService!.getQuizById(quizId);
      if (quizData) {
        setQuiz(quizData);
        
        // Track quiz start
        await performanceService!.trackQuizStart(
          studentId,
          quizId,
          quizData.subject,
          quizData.topic
        );
      }
    } catch (error) {
      console.error('Error loading quiz:', error);
      Alert.alert('Error', 'Failed to load quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSubmit = async (questionId: string, answer: string) => {
    if (!quiz || !contentService || !performanceService || !studentId) return;

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
      await performanceService.trackQuizAnswer(
        studentId,
        quizId,
        quiz.subject,
        quiz.topic,
        answer,
        result.correct,
        hintsUsed
      );

    } catch (error) {
      console.error('Error validating answer:', error);
      Alert.alert('Error', 'Failed to validate answer');
    }
  };

  const handleRequestHint = async () => {
    if (!quiz || !contentService || !studentId) return;

    const currentQuestion = quiz.questions[currentQuestionIndex];
    const nextLevel = hintsUsed + 1;

    try {
      const hint = await contentService.getHint(quizId, currentQuestion.questionId, nextLevel);
      
      if (hint) {
        setCurrentHint(hint);
        setHintsUsed(nextLevel);

        // Track hint request
        await performanceService!.trackHintRequested(
          studentId,
          quizId,
          quiz.subject,
          quiz.topic,
          nextLevel
        );
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
    if (!quiz || !performanceService || !studentId) return;

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    try {
      await performanceService.trackQuizComplete(
        studentId,
        quizId,
        quiz.subject,
        quiz.topic,
        timeSpent
      );

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
