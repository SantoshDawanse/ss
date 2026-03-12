/**
 * Quiz View Screen - Interactive quiz with hints and feedback
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { QuizDisplay } from '@/src/components/QuizDisplay';
import { FeedbackDisplay, HintDisplay } from '@/src/components/FeedbackDisplay';
import { useApp } from '@/src/contexts/AppContext';
import { Quiz, Hint } from '@/src/models';
import { QuizFeedback } from '@/src/services';

export default function QuizViewScreen() {
  const router = useRouter();
  const { quizId } = useLocalSearchParams<{ quizId: string }>();
  const { dbManager, performanceService, studentId } = useApp();
  
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [feedback, setFeedback] = useState<QuizFeedback | null>(null);
  const [currentHint, setCurrentHint] = useState<Hint | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startTime] = useState(Date.now());
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (quizId && dbManager && performanceService && studentId) {
      loadQuiz();
    }
  }, [quizId, dbManager, performanceService, studentId]);

  const loadQuiz = async () => {
    if (!studentId) return;
    
    try {
      const quizRow = await dbManager!.quizRepository.findById(quizId);
      if (quizRow) {
        const quizData = dbManager!.quizRepository.parseQuiz(quizRow);
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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadQuiz();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAnswerSubmit = async (questionId: string, answer: string) => {
    if (!quiz || !dbManager || !performanceService || !studentId) return;

    const currentQuestion = quiz.questions[currentQuestionIndex];
    
    try {
      // Validate answer locally
      const correct = isAnswerCorrect(answer, currentQuestion.correctAnswer, currentQuestion.type);

      const result: QuizFeedback = {
        correct,
        explanation: currentQuestion.explanation,
        nextHintLevel: !correct && hintsUsed < 3 ? hintsUsed + 1 : undefined,
        encouragement: generateEncouragement(correct, hintsUsed),
      };

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

  const isAnswerCorrect = (
    userAnswer: string,
    correctAnswer: string,
    questionType: string
  ): boolean => {
    // Handle null/undefined values
    if (!userAnswer || !correctAnswer) {
      return false;
    }

    const normalizedUser = userAnswer.trim().toLowerCase();
    const normalizedCorrect = correctAnswer.trim().toLowerCase();

    switch (questionType) {
      case 'multiple_choice':
      case 'true_false':
        return normalizedUser === normalizedCorrect;
      
      case 'short_answer':
        return (
          normalizedUser === normalizedCorrect ||
          normalizedUser.includes(normalizedCorrect) ||
          normalizedCorrect.includes(normalizedUser)
        );
      
      default:
        return normalizedUser === normalizedCorrect;
    }
  };

  const generateEncouragement = (correct: boolean, hintsUsed: number): string => {
    if (correct) {
      if (hintsUsed === 0) {
        return 'Excellent! You got it right on your own!';
      } else if (hintsUsed === 1) {
        return 'Great job! You figured it out with a little help.';
      } else {
        return 'Well done! Keep practicing to improve.';
      }
    } else {
      if (hintsUsed === 0) {
        return 'Not quite right. Would you like a hint?';
      } else if (hintsUsed < 3) {
        return 'Keep trying! Would you like another hint?';
      } else {
        return 'Let\'s review the explanation and try again later.';
      }
    }
  };

  const handleRequestHint = async () => {
    if (!quiz || !dbManager || !studentId) return;

    const currentQuestion = quiz.questions[currentQuestionIndex];
    const nextLevel = hintsUsed + 1;

    try {
      const hintRows = await dbManager.hintRepository.findByQuizAndQuestion(quizId, currentQuestion.questionId);
      const hint = hintRows.find(row => row.level === nextLevel);
      
      if (hint) {
        setCurrentHint({
          hintId: hint.hint_id,
          level: hint.level,
          text: hint.hint_text,
        });
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

  const handleFlagQuestion = () => {
    if (!quiz) return;

    const currentQuestion = quiz.questions[currentQuestionIndex];
    const newFlagged = new Set(flaggedQuestions);
    newFlagged.add(currentQuestion.questionId);
    setFlaggedQuestions(newFlagged);

    Alert.alert(
      'Question Flagged',
      'This question has been flagged for review. You can continue to the next question.',
      [
        {
          text: 'Continue',
          onPress: handleSkipQuestion,
        },
      ]
    );
  };

  const handleSkipQuestion = () => {
    if (!quiz) return;

    // Move to next question or complete quiz
    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setFeedback(null);
      setHintsUsed(0);
    } else {
      handleQuizComplete();
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

      // Log flagged questions for review
      if (flaggedQuestions.size > 0) {
        console.log('Flagged questions for review:', {
          quizId,
          flaggedQuestionIds: Array.from(flaggedQuestions),
          timestamp: new Date().toISOString(),
        });
      }

      const message = flaggedQuestions.size > 0
        ? `Excellent work! Keep learning!\n\n${flaggedQuestions.size} question(s) have been flagged for review.`
        : 'Excellent work! Keep learning!';

      Alert.alert(
        'Quiz Complete!',
        message,
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
        refreshing={refreshing}
        onRefresh={onRefresh}
        onFlagQuestion={handleFlagQuestion}
        onSkipQuestion={handleSkipQuestion}
        isFlagged={flaggedQuestions.has(quiz.questions[currentQuestionIndex]?.questionId)}
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
