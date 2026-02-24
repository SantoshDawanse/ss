/**
 * Progress Screen - View learning progress and statistics
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loading } from '@/components/ui/loading';
import { useApp } from '@/src/contexts/AppContext';

interface ProgressStats {
  totalLessons: number;
  completedLessons: number;
  totalQuizzes: number;
  completedQuizzes: number;
  studyTimeHours: number;
  dayStreak: number;
}

export default function ProgressScreen() {
  const { studentId, dbManager, isInitialized } = useApp();
  const [stats, setStats] = useState<ProgressStats>({
    totalLessons: 0,
    completedLessons: 0,
    totalQuizzes: 0,
    completedQuizzes: 0,
    studyTimeHours: 0,
    dayStreak: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProgressData = async () => {
      if (!studentId || !dbManager || !isInitialized) {
        setIsLoading(false);
        return;
      }

      try {
        // Get active bundle for the student
        const activeBundle = await dbManager.learningBundleRepository.getActiveBundle(studentId);
        
        if (!activeBundle) {
          setIsLoading(false);
          return;
        }

        // Get total lessons and quizzes from the bundle
        const lessons = await dbManager.lessonRepository.findByBundle(activeBundle.bundle_id);
        const quizzes = await dbManager.quizRepository.findByBundleAndSubject(
          activeBundle.bundle_id,
          'Mathematics' // TODO: Make this dynamic based on current subject
        );

        // Get performance logs to count completed items
        const performanceLogs = await dbManager.performanceLogRepository.findRecentByStudent(studentId, 1000);
        
        // Count unique completed lessons and quizzes
        const completedLessonIds = new Set(
          performanceLogs
            .filter(log => log.event_type === 'lesson_complete')
            .map(log => log.content_id)
        );
        
        const completedQuizIds = new Set(
          performanceLogs
            .filter(log => log.event_type === 'quiz_complete')
            .map(log => log.content_id)
        );

        // Calculate total study time from lesson and quiz completion events
        const studyTimeMs = performanceLogs
          .filter(log => 
            (log.event_type === 'lesson_complete' || log.event_type === 'quiz_complete') &&
            log.data_json
          )
          .reduce((total, log) => {
            try {
              const data = JSON.parse(log.data_json);
              return total + (data.timeSpent || 0);
            } catch {
              return total;
            }
          }, 0);

        setStats({
          totalLessons: lessons.length,
          completedLessons: completedLessonIds.size,
          totalQuizzes: quizzes.length,
          completedQuizzes: completedQuizIds.size,
          studyTimeHours: Math.round(studyTimeMs / (1000 * 60 * 60) * 10) / 10, // Convert to hours with 1 decimal
          dayStreak: 0, // TODO: Calculate streak from performance logs
        });
      } catch (error) {
        console.error('Error fetching progress data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProgressData();
  }, [studentId, dbManager, isInitialized]);

  if (isLoading) {
    return <Loading message="Loading progress..." />;
  }

  const lessonProgress = stats.totalLessons > 0 
    ? Math.round((stats.completedLessons / stats.totalLessons) * 100) 
    : 0;
  
  const quizProgress = stats.totalQuizzes > 0 
    ? Math.round((stats.completedQuizzes / stats.totalQuizzes) * 100) 
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top']}>
      {/* Header */}
      <View className="px-6 pt-6 pb-4 bg-white border-b border-neutral-200">
        <Text className="text-3xl font-bold text-neutral-900 mb-1">📊 Progress</Text>
        <Text className="text-sm text-neutral-600">Track your learning journey</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="p-4">
          {/* Overall Progress */}
          <Card variant="elevated" padding="lg" style={{ marginBottom: 16 }}>
            <CardHeader>
              <View className="flex-row items-center mb-2">
                <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center mr-3">
                  <Ionicons name="trending-up" size={20} color="#2196F3" />
                </View>
                <Text className="text-xl font-semibold text-neutral-900">Overall Progress</Text>
              </View>
            </CardHeader>
            <CardContent>
              <View className="mb-4">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-neutral-600">Lessons Completed</Text>
                  <Text className="text-sm font-semibold text-neutral-900">
                    {stats.completedLessons} / {stats.totalLessons}
                  </Text>
                </View>
                <Progress value={lessonProgress} showLabel variant="default" />
              </View>
              <View>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-neutral-600">Quizzes Completed</Text>
                  <Text className="text-sm font-semibold text-neutral-900">
                    {stats.completedQuizzes} / {stats.totalQuizzes}
                  </Text>
                </View>
                <Progress value={quizProgress} showLabel variant="success" />
              </View>
            </CardContent>
          </Card>

          {/* Statistics Grid */}
          <Card variant="elevated" padding="lg" style={{ marginBottom: 16 }}>
            <CardHeader>
              <View className="flex-row items-center mb-2">
                <View className="w-10 h-10 rounded-full bg-success-100 items-center justify-center mr-3">
                  <Ionicons name="stats-chart" size={20} color="#4CAF50" />
                </View>
                <Text className="text-xl font-semibold text-neutral-900">Statistics</Text>
              </View>
            </CardHeader>
            <CardContent>
              <View className="flex-row justify-between mb-3">
                <View className="flex-1 items-center p-4 bg-primary-50 rounded-xl mr-2">
                  <Ionicons name="book" size={28} color="#2196F3" className="mb-2" />
                  <Text className="text-2xl font-bold text-primary-700 mt-2">{stats.totalLessons}</Text>
                  <Text className="text-xs text-neutral-600 mt-1 text-center">Total Lessons</Text>
                </View>
                <View className="flex-1 items-center p-4 bg-success-50 rounded-xl ml-2">
                  <Ionicons name="checkmark-circle" size={28} color="#4CAF50" className="mb-2" />
                  <Text className="text-2xl font-bold text-success-700 mt-2">{stats.totalQuizzes}</Text>
                  <Text className="text-xs text-neutral-600 mt-1 text-center">Total Quizzes</Text>
                </View>
              </View>
              <View className="flex-row justify-between">
                <View className="flex-1 items-center p-4 bg-secondary-50 rounded-xl mr-2">
                  <Ionicons name="time" size={28} color="#FF9800" className="mb-2" />
                  <Text className="text-2xl font-bold text-secondary-700 mt-2">{stats.studyTimeHours}h</Text>
                  <Text className="text-xs text-neutral-600 mt-1 text-center">Study Time</Text>
                </View>
                <View className="flex-1 items-center p-4 bg-neutral-100 rounded-xl ml-2">
                  <Ionicons name="flame" size={28} color="#FF5722" className="mb-2" />
                  <Text className="text-2xl font-bold text-neutral-700 mt-2">{stats.dayStreak}</Text>
                  <Text className="text-xs text-neutral-600 mt-1 text-center">Day Streak</Text>
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card variant="elevated" padding="lg">
            <CardHeader>
              <View className="flex-row items-center mb-2">
                <View className="w-10 h-10 rounded-full bg-secondary-100 items-center justify-center mr-3">
                  <Ionicons name="time-outline" size={20} color="#FF9800" />
                </View>
                <Text className="text-xl font-semibold text-neutral-900">Recent Activity</Text>
              </View>
            </CardHeader>
            <CardContent>
              {stats.completedLessons === 0 && stats.completedQuizzes === 0 ? (
                <View className="items-center py-8">
                  <View className="w-16 h-16 rounded-full bg-neutral-100 items-center justify-center mb-3">
                    <Ionicons name="calendar-outline" size={32} color="#9E9E9E" />
                  </View>
                  <Text className="text-base font-semibold text-neutral-600 mb-1">No recent activity</Text>
                  <Text className="text-sm text-neutral-400 text-center">
                    Start learning to see your progress here!
                  </Text>
                </View>
              ) : (
                <View className="py-4">
                  <Text className="text-sm text-neutral-600 mb-2">
                    You've completed {stats.completedLessons} lesson{stats.completedLessons !== 1 ? 's' : ''} and {stats.completedQuizzes} quiz{stats.completedQuizzes !== 1 ? 'zes' : ''}!
                  </Text>
                  <Text className="text-sm text-neutral-600">
                    Keep up the great work! 🎉
                  </Text>
                </View>
              )}
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
