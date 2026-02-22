/**
 * Quiz Display Component
 * Renders quiz questions with multiple choice, true/false, and short answer support.
 * Requirements: 3.1, 15.3
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Quiz, Question } from '../models';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

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
      <View className="space-y-3">
        {question.options?.map((option, index) => (
          <TouchableOpacity
            key={index}
            className={`p-4 rounded-lg border-2 ${
              selectedAnswer === option
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-300 bg-white'
            }`}
            onPress={() => setSelectedAnswer(option)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Option ${index + 1}: ${option}`}
          >
            <View className="flex-row items-center">
              <View
                className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                  selectedAnswer === option
                    ? 'border-primary-500'
                    : 'border-neutral-400'
                }`}
              >
                {selectedAnswer === option && (
                  <View className="w-3 h-3 rounded-full bg-primary-500" />
                )}
              </View>
              <Text className="flex-1 text-base text-neutral-800">
                {option}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderTrueFalse = (question: Question) => {
    return (
      <View className="space-y-3">
        {['True', 'False'].map((option) => (
          <TouchableOpacity
            key={option}
            className={`p-4 rounded-lg border-2 ${
              selectedAnswer === option
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-300 bg-white'
            }`}
            onPress={() => setSelectedAnswer(option)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={option}
          >
            <View className="flex-row items-center">
              <View
                className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                  selectedAnswer === option
                    ? 'border-primary-500'
                    : 'border-neutral-400'
                }`}
              >
                {selectedAnswer === option && (
                  <View className="w-3 h-3 rounded-full bg-primary-500" />
                )}
              </View>
              <Text className="flex-1 text-base text-neutral-800">
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
      <Input
        value={shortAnswer}
        onChangeText={setShortAnswer}
        placeholder="तपाईंको उत्तर यहाँ लेख्नुहोस् / Type your answer here"
        multiline
        numberOfLines={4}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
        accessible={true}
        accessibilityLabel="Answer input field"
      />
    );
  };

  const canSubmit =
    currentQuestion.type === 'short_answer' ? shortAnswer.trim() !== '' : selectedAnswer !== '';

  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  return (
    <ScrollView className="flex-1 bg-neutral-50">
      <View className="p-4">
        {/* Header Card */}
        <Card variant="elevated" padding="lg" style={{ marginBottom: 16 }}>
          <Text className="text-2xl font-bold text-neutral-900 mb-3">
            {quiz.title}
          </Text>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-sm text-neutral-600">
              Question {currentQuestionIndex + 1} of {quiz.questions.length}
            </Text>
            {quiz.timeLimit && (
              <Badge variant="warning" size="sm">
                ⏱️ {quiz.timeLimit} min
              </Badge>
            )}
          </View>
          <Progress value={progress} showLabel size="md" />
        </Card>

        {/* Question Card */}
        <Card variant="elevated" padding="lg" style={{ marginBottom: 16 }}>
          <CardHeader>
            <Badge variant="info" size="sm">
              Question {currentQuestionIndex + 1}
            </Badge>
          </CardHeader>
          <CardContent>
            <Text className="text-lg text-neutral-900 leading-7">
              {currentQuestion.question}
            </Text>
          </CardContent>
        </Card>

        {/* Answer Options */}
        <View className="mb-6">
          {currentQuestion.type === 'multiple_choice' && renderMultipleChoice(currentQuestion)}
          {currentQuestion.type === 'true_false' && renderTrueFalse(currentQuestion)}
          {currentQuestion.type === 'short_answer' && renderShortAnswer()}
        </View>

        {/* Submit Button */}
        <Button
          onPress={handleSubmit}
          disabled={!canSubmit}
          variant="primary"
          size="lg"
          fullWidth
        >
          {currentQuestionIndex < quiz.questions.length - 1
            ? 'पेश गर्नुहोस् / Submit'
            : 'समाप्त गर्नुहोस् / Finish'}
        </Button>
      </View>
    </ScrollView>
  );
};
