/**
 * Quiz Display Component
 * Renders quiz questions with multiple choice, true/false, and short answer support.
 * Requirements: 3.1, 15.3
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Quiz, Question } from '../models';

interface QuizDisplayProps {
  quiz: Quiz;
  onAnswerSubmit: (questionId: string, answer: string) => void;
  currentQuestionIndex: number;
}

export const QuizDisplay: React.FC<QuizDisplayProps> = ({
  quiz,
  onAnswerSubmit,
  currentQuestionIndex,
}) => {
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [shortAnswer, setShortAnswer] = useState<string>('');

  const currentQuestion = quiz.questions[currentQuestionIndex];

  if (!currentQuestion) {
    return null;
  }

  const handleSubmit = () => {
    const answer = currentQuestion.type === 'short_answer' ? shortAnswer : selectedAnswer;
    if (answer) {
      onAnswerSubmit(currentQuestion.questionId, answer);
      setSelectedAnswer('');
      setShortAnswer('');
    }
  };

  const renderMultipleChoice = (question: Question) => {
    return (
      <View style={styles.optionsContainer}>
        {question.options?.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.optionButton,
              selectedAnswer === option && styles.optionButtonSelected,
            ]}
            onPress={() => setSelectedAnswer(option)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Option ${index + 1}: ${option}`}
          >
            <View style={styles.optionContent}>
              <View
                style={[
                  styles.radioButton,
                  selectedAnswer === option && styles.radioButtonSelected,
                ]}
              >
                {selectedAnswer === option && <View style={styles.radioButtonInner} />}
              </View>
              <Text style={styles.optionText}>{option}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderTrueFalse = (question: Question) => {
    return (
      <View style={styles.optionsContainer}>
        {['True', 'False'].map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.optionButton,
              selectedAnswer === option && styles.optionButtonSelected,
            ]}
            onPress={() => setSelectedAnswer(option)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={option}
          >
            <View style={styles.optionContent}>
              <View
                style={[
                  styles.radioButton,
                  selectedAnswer === option && styles.radioButtonSelected,
                ]}
              >
                {selectedAnswer === option && <View style={styles.radioButtonInner} />}
              </View>
              <Text style={styles.optionText}>
                {option === 'True' ? 'सत्य / True' : 'असत्य / False'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderShortAnswer = () => {
    return (
      <View style={styles.shortAnswerContainer}>
        <TextInput
          style={styles.shortAnswerInput}
          value={shortAnswer}
          onChangeText={setShortAnswer}
          placeholder="तपाईंको उत्तर यहाँ लेख्नुहोस् / Type your answer here"
          placeholderTextColor="#999999"
          multiline
          numberOfLines={4}
          accessible={true}
          accessibilityLabel="Answer input field"
        />
      </View>
    );
  };

  const canSubmit =
    currentQuestion.type === 'short_answer' ? shortAnswer.trim() !== '' : selectedAnswer !== '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>{quiz.title}</Text>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            Question {currentQuestionIndex + 1} of {quiz.questions.length}
          </Text>
          {quiz.timeLimit && (
            <Text style={styles.timeLimitText}>Time: {quiz.timeLimit} minutes</Text>
          )}
        </View>
      </View>

      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>{currentQuestion.question}</Text>
      </View>

      {currentQuestion.type === 'multiple_choice' && renderMultipleChoice(currentQuestion)}
      {currentQuestion.type === 'true_false' && renderTrueFalse(currentQuestion)}
      {currentQuestion.type === 'short_answer' && renderShortAnswer()}

      <TouchableOpacity
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Submit answer"
      >
        <Text style={styles.submitButtonText}>
          {currentQuestionIndex < quiz.questions.length - 1
            ? 'पेश गर्नुहोस् / Submit'
            : 'समाप्त गर्नुहोस् / Finish'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    padding: isTablet ? 24 : 16,
  },
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: isTablet ? 28 : 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    color: '#666666',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  timeLimitText: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '600',
  },
  questionContainer: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  questionText: {
    fontSize: isTablet ? 20 : 18,
    lineHeight: isTablet ? 30 : 26,
    color: '#1A1A1A',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  optionsContainer: {
    marginBottom: 24,
  },
  optionButton: {
    marginBottom: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 8,
  },
  optionButtonSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#999999',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: '#2196F3',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  optionText: {
    flex: 1,
    fontSize: isTablet ? 18 : 16,
    color: '#333333',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  shortAnswerContainer: {
    marginBottom: 24,
  },
  shortAnswerInput: {
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 16,
    fontSize: isTablet ? 18 : 16,
    minHeight: 120,
    textAlignVertical: 'top',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  submitButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
});
