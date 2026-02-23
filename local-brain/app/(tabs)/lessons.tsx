/**
 * Lessons Screen - Browse and view lessons
 */

import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/src/contexts/AppContext';
import { Lesson } from '@/src/models';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';

export default function LessonsScreen() {
  const router = useRouter();
  const { contentService, performanceService, studentId, isInitialized } = useApp();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isInitialized && contentService && performanceService) {
      loadLessons();
    }
  }, [isInitialized, contentService, performanceService]);

  // Reload completion status when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (isInitialized && performanceService) {
        loadCompletedLessons();
      }
    }, [isInitialized, performanceService])
  );

  const loadLessons = async () => {
    try {
      setLoading(true);
      const nextLesson = await contentService!.getNextLesson(studentId, 'Mathematics');
      
      if (nextLesson) {
        setLessons([nextLesson]);
      }
    } catch (error) {
      console.error('Error loading lessons:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedLessons = async () => {
    try {
      const logs = await performanceService!.getLogsBySubject(studentId, 'Mathematics');
      const completed = new Set(
        logs
          .filter(log => log.eventType === 'lesson_complete')
          .map(log => log.contentId)
      );
      setCompletedLessons(completed);
    } catch (error) {
      console.error('Error loading completed lessons:', error);
    }
  };

  const handleLessonPress = (lesson: Lesson) => {
    router.push({
      pathname: '/lesson-view',
      params: { lessonId: lesson.lessonId },
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
    return <Loading message="Loading lessons..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top']}>
      {/* Header */}
      <View className="px-6 pt-6 pb-4 bg-white border-b border-neutral-200">
        <Text className="text-3xl font-bold text-neutral-900 mb-1">📚 Lessons</Text>
        <Text className="text-sm text-neutral-600">Continue your learning journey</Text>
      </View>

      {lessons.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <View className="w-20 h-20 rounded-full bg-neutral-100 items-center justify-center mb-4">
            <Ionicons name="book-outline" size={40} color="#9E9E9E" />
          </View>
          <Text className="text-lg font-semibold text-neutral-700 mb-2">No lessons available</Text>
          <Text className="text-sm text-neutral-500 text-center">
            Check back later for new content
          </Text>
        </View>
      ) : (
        <FlatList
          data={lessons}
          keyExtractor={(item) => item.lessonId}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isCompleted = completedLessons.has(item.lessonId);
            
            return (
              <TouchableOpacity 
                onPress={() => handleLessonPress(item)}
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
                      <View className="flex-row items-center">
                        <Ionicons name="time-outline" size={14} color="#2196F3" />
                        <Text className="text-sm text-primary-500 ml-1">
                          {item.estimatedMinutes} minutes
                        </Text>
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
                          Review
                        </Text>
                        <Ionicons name="refresh" size={16} color="#666666" />
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row items-center justify-end">
                      <Text className="text-sm font-semibold text-primary-500 mr-1">
                        Start Lesson
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
