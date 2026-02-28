/**
 * Quizzes Screen - Browse and start quizzes
 * Requirements: 9.4, 9.5
 */

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/src/contexts/AppContext';
import { Quiz } from '@/src/models';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';

export default function QuizzesScreen() {
  const router = useRouter();
  const { dbManager, performanceService, studentId, isInitialized } = useApp();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [filteredQuizzes, setFilteredQuizzes] = useState<Quiz[]>([]);
  const [completedQuizzes, setCompletedQuizzes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);

  const subjects = ['Mathematics', 'Science', 'Social Studies'];
  const difficulties = ['easy', 'medium', 'hard'];

  useEffect(() => {
    if (isInitialized && dbManager && performanceService) {
      loadQuizzes();
    }
  }, [isInitialized, dbManager, performanceService]);

  // Reload completion status when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (isInitialized && performanceService) {
        loadCompletedQuizzes();
      }
    }, [isInitialized, performanceService])
  );

  // Apply filters when quizzes or filter selections change
  useEffect(() => {
    applyFilters();
  }, [quizzes, selectedSubject, selectedDifficulty]);

  const loadQuizzes = async () => {
    if (!studentId || !dbManager) {
      console.warn('Cannot load quizzes: studentId or dbManager is null');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // Get active bundle for student
      const activeBundleResult = await dbManager.executeSql(
        `SELECT bundle_id FROM learning_bundles 
         WHERE student_id = ? AND status = 'active' 
         ORDER BY valid_from DESC LIMIT 1`,
        [studentId]
      );

      if (activeBundleResult.length === 0) {
        setQuizzes([]);
        setLoading(false);
        return;
      }

      const bundleId = activeBundleResult[0].bundle_id;

      // Get all quizzes from active bundle
      const quizRows = await dbManager.executeSql(
        `SELECT * FROM quizzes WHERE bundle_id = ? ORDER BY quiz_id`,
        [bundleId]
      );
      
      // Parse quizzes
      const parsedQuizzes = quizRows.map((row: any) => 
        dbManager.quizRepository.parseQuiz(row)
      );

      setQuizzes(parsedQuizzes);
    } catch (error) {
      console.error('Error loading quizzes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedQuizzes = async () => {
    if (!studentId) return;
    
    try {
      const logs = await performanceService!.getAllLogs(studentId);
      const completed = new Set(
        logs
          .filter(log => log.eventType === 'quiz_complete')
          .map(log => log.contentId)
      );
      setCompletedQuizzes(completed);
    } catch (error) {
      console.error('Error loading completed quizzes:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...quizzes];

    // Filter by subject
    if (selectedSubject) {
      filtered = filtered.filter(quiz => quiz.subject === selectedSubject);
    }

    // Filter by difficulty
    if (selectedDifficulty) {
      filtered = filtered.filter(quiz => quiz.difficulty === selectedDifficulty);
    }

    setFilteredQuizzes(filtered);
  };

  const handleSubjectFilter = (subject: string) => {
    setSelectedSubject(selectedSubject === subject ? null : subject);
  };

  const handleDifficultyFilter = (difficulty: string) => {
    setSelectedDifficulty(selectedDifficulty === difficulty ? null : difficulty);
  };

  const handleQuizPress = (quiz: Quiz) => {
    router.push({
      pathname: '/quiz-view',
      params: { quizId: quiz.quizId },
    });
  };

  const getDifficultyVariant = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy': return 'success';
      case 'medium': return 'warning';
      case 'hard': return 'error';
      default: return 'default';
    }
  };

  if (!isInitialized) {
    return <Loading message="Initializing..." />;
  }

  if (loading) {
    return <Loading message="Loading quizzes..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top']}>
      {/* Header */}
      <View className="px-6 pt-6 pb-4 bg-white border-b border-neutral-200">
        <Text className="text-3xl font-bold text-neutral-900 mb-1">🎯 Quizzes</Text>
        <Text className="text-sm text-neutral-600">Test your knowledge</Text>
      </View>

      {/* Filters */}
      <View className="bg-white border-b border-neutral-200 px-4 py-3">
        {/* Subject Filter */}
        <Text className="text-xs font-semibold text-neutral-600 mb-2">SUBJECT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          <View className="flex-row gap-2">
            {subjects.map(subject => (
              <TouchableOpacity
                key={subject}
                onPress={() => handleSubjectFilter(subject)}
                activeOpacity={0.7}
              >
                <Badge 
                  variant={selectedSubject === subject ? 'primary' : 'default'}
                  size="sm"
                >
                  {subject}
                </Badge>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Difficulty Filter */}
        <Text className="text-xs font-semibold text-neutral-600 mb-2">DIFFICULTY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {difficulties.map(difficulty => (
              <TouchableOpacity
                key={difficulty}
                onPress={() => handleDifficultyFilter(difficulty)}
                activeOpacity={0.7}
              >
                <Badge 
                  variant={selectedDifficulty === difficulty ? getDifficultyVariant(difficulty) : 'default'}
                  size="sm"
                >
                  {difficulty}
                </Badge>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {filteredQuizzes.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <View className="w-20 h-20 rounded-full bg-neutral-100 items-center justify-center mb-4">
            <Ionicons name="checkmark-circle-outline" size={40} color="#9E9E9E" />
          </View>
          <Text className="text-lg font-semibold text-neutral-700 mb-2">
            {quizzes.length === 0 ? 'No quizzes available' : 'No quizzes match filters'}
          </Text>
          <Text className="text-sm text-neutral-500 text-center">
            {quizzes.length === 0 
              ? 'Complete some lessons first to unlock quizzes'
              : 'Try adjusting your filters'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredQuizzes}
          keyExtractor={(item) => item.quizId}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isCompleted = completedQuizzes.has(item.quizId);
            
            return (
              <TouchableOpacity 
                onPress={() => handleQuizPress(item)}
                activeOpacity={0.7}
              >
                <Card variant="elevated" padding="lg" style={{ marginBottom: 12 }}>
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1 mr-3">
                      <View className="flex-row items-center mb-2">
                        <Text className="text-lg font-bold text-neutral-900 flex-1">
                          {item.title}
                        </Text>
                        {isCompleted && (
                          <View className="ml-2">
                            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                          </View>
                        )}
                      </View>
                      <View className="flex-row items-center mb-2">
                        <Ionicons name="folder-outline" size={14} color="#666666" />
                        <Text className="text-sm text-neutral-600 ml-1">
                          {item.subject} • {item.topic}
                        </Text>
                      </View>
                      <View className="flex-row items-center space-x-4">
                        <View className="flex-row items-center mr-4">
                          <Ionicons name="document-text-outline" size={14} color="#2196F3" />
                          <Text className="text-sm text-primary-500 ml-1">
                            {item.questions.length} questions
                          </Text>
                        </View>
                        {item.timeLimit && (
                          <View className="flex-row items-center">
                            <Ionicons name="time-outline" size={14} color="#FF9800" />
                            <Text className="text-sm text-secondary-500 ml-1">
                              {item.timeLimit} min
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Badge variant={getDifficultyVariant(item.difficulty)} size="sm">
                      {item.difficulty}
                    </Badge>
                  </View>
                  {isCompleted ? (
                    <View className="flex-row items-center justify-between">
                      <Badge variant="success" size="sm">
                        ✓ Completed
                      </Badge>
                      <View className="flex-row items-center">
                        <Text className="text-sm font-semibold text-neutral-600 mr-1">
                          Retake
                        </Text>
                        <Ionicons name="refresh" size={16} color="#666666" />
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row items-center justify-end">
                      <Text className="text-sm font-semibold text-primary-500 mr-1">
                        Start Quiz
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color="#2196F3" />
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </SafeAreaView>
  );
}
