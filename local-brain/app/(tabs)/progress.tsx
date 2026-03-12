/**
 * Progress Screen - View learning progress and statistics
 */

import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loading } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/src/contexts/AppContext';
import { StudentProfileService } from '@/src/services/StudentProfileService';

interface ProgressStats {
  totalLessons: number;
  completedLessons: number;
  totalQuizzes: number;
  completedQuizzes: number;
  studyTimeHours: number;
  dayStreak: number;
}

interface RecentActivity {
  id: string;
  type: 'lesson' | 'quiz';
  title: string;
  subject: string;
  topic: string;
  timestamp: Date;
  score?: number;
  timeSpent?: number;
}

interface UserProfile {
  studentId: string;
  studentName: string;
  createdAt: Date;
}

/**
 * Calculate consecutive day streak from performance logs
 */
function calculateDayStreak(logs: any[]): number {
  if (logs.length === 0) return 0;

  // Get unique days with activity (in local timezone)
  const activeDays = new Set<string>();
  logs.forEach(log => {
    const date = new Date(log.timestamp);
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    activeDays.add(dayKey);
  });

  const sortedDays = Array.from(activeDays).sort().reverse();
  
  // Check if today has activity
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  
  if (!sortedDays.includes(todayKey)) {
    // Check if yesterday has activity (streak might still be valid)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
    
    if (!sortedDays.includes(yesterdayKey)) {
      return 0; // Streak is broken
    }
  }

  // Count consecutive days
  let streak = 0;
  let currentDate = new Date(today);
  
  for (let i = 0; i < 365; i++) { // Max check 1 year
    const dateKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
    if (sortedDays.includes(dateKey)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Format time ago string
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

export default function ProgressScreen() {
  const { studentId, dbManager, isInitialized } = useApp();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<ProgressStats>({
    totalLessons: 0,
    completedLessons: 0,
    totalQuizzes: 0,
    completedQuizzes: 0,
    studyTimeHours: 0,
    dayStreak: 0,
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProgressData = useCallback(async (showLoading: boolean = true) => {
    if (!studentId || !dbManager || !isInitialized) {
      if (showLoading) setIsLoading(false);
      return;
    }

    try {
      if (showLoading) setIsLoading(true);

      // Load user profile
      const profileService = StudentProfileService.getInstance();
      const userProfile = await profileService.loadProfile();
      if (userProfile) {
        setProfile({
          studentId: userProfile.studentId,
          studentName: userProfile.studentName,
          createdAt: userProfile.createdAt ? new Date(userProfile.createdAt) : new Date(),
        });
      }
      // Get active bundle for the student
      const activeBundle = await dbManager.learningBundleRepository.getActiveBundle(studentId);
      
      if (!activeBundle) {
        if (showLoading) setIsLoading(false);
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

      // Calculate total study time from lesson and quiz sessions
      // Track time between start and complete events
      const sessionTimes = new Map<string, number>();
      let totalStudyTimeMs = 0;

      performanceLogs.forEach(log => {
        const sessionKey = `${log.event_type.replace('_complete', '').replace('_start', '')}_${log.content_id}`;
        
        if (log.event_type === 'lesson_start' || log.event_type === 'quiz_start') {
          sessionTimes.set(sessionKey, log.timestamp);
        } else if (log.event_type === 'lesson_complete' || log.event_type === 'quiz_complete') {
          const startTime = sessionTimes.get(sessionKey);
          if (startTime) {
            const duration = log.timestamp - startTime;
            // Only count reasonable durations (between 10 seconds and 2 hours)
            if (duration > 10000 && duration < 7200000) {
              totalStudyTimeMs += duration;
            }
          }
          // Also check for timeSpent in data_json
          try {
            const data = JSON.parse(log.data_json);
            if (data.timeSpent && typeof data.timeSpent === 'number') {
              totalStudyTimeMs += data.timeSpent;
            }
          } catch {
            // Ignore parse errors
          }
        }
      });

      // Calculate day streak
      const dayStreak = calculateDayStreak(performanceLogs);

      // Get recent activities (last 10 completed items)
      const recentCompletedLogs = performanceLogs
        .filter(log => log.event_type === 'lesson_complete' || log.event_type === 'quiz_complete')
        .slice(0, 10);

      const activities: RecentActivity[] = [];
      for (const log of recentCompletedLogs) {
        try {
          const data = JSON.parse(log.data_json);
          let title = 'Unknown';
          
          if (log.event_type === 'lesson_complete') {
            const lesson = await dbManager.lessonRepository.findById(log.content_id);
            title = lesson?.title || 'Lesson';
          } else if (log.event_type === 'quiz_complete') {
            const quiz = await dbManager.quizRepository.findById(log.content_id);
            title = quiz?.title || 'Quiz';
          }

          activities.push({
            id: `${log.log_id}`,
            type: log.event_type === 'lesson_complete' ? 'lesson' : 'quiz',
            title,
            subject: log.subject,
            topic: log.topic,
            timestamp: new Date(log.timestamp),
            score: data.score,
            timeSpent: data.timeSpent,
          });
        } catch (error) {
          console.error('Error parsing activity log:', error);
        }
      }

      setRecentActivities(activities);

      setStats({
        totalLessons: lessons.length,
        completedLessons: completedLessonIds.size,
        totalQuizzes: quizzes.length,
        completedQuizzes: completedQuizIds.size,
        studyTimeHours: Math.round(totalStudyTimeMs / (1000 * 60 * 60) * 10) / 10, // Convert to hours with 1 decimal
        dayStreak,
      });
    } catch (error) {
      console.error('Error fetching progress data:', error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [studentId, dbManager, isInitialized]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchProgressData(false);
    }, [fetchProgressData])
  );

  // Initial load
  useEffect(() => {
    fetchProgressData(true);
  }, [fetchProgressData]);

  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchProgressData(false);
    setIsRefreshing(false);
  }, [fetchProgressData]);

  if (isLoading) {
    return <Loading message="Loading progress..." />;
  }

  const lessonProgress = stats.totalLessons > 0 
    ? Math.round((stats.completedLessons / stats.totalLessons) * 100) 
    : 0;
  
  const quizProgress = stats.totalQuizzes > 0 
    ? Math.round((stats.completedQuizzes / stats.totalQuizzes) * 100) 
    : 0;

  const daysSinceRegistration = profile 
    ? Math.floor((Date.now() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top']}>
      {/* Header */}
      <View className="px-6 pt-6 pb-4 bg-white border-b border-neutral-200">
        <Text className="text-3xl font-bold text-neutral-900 mb-1">📊 Progress</Text>
        <Text className="text-sm text-neutral-600">Track your learning journey</Text>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#2196F3"
            colors={['#2196F3']}
          />
        }
      >
        <View className="p-4">
          {/* User Profile Card */}
          {profile && (
            <Card variant="elevated" padding="lg" style={{ marginBottom: 16 }}>
              <CardContent>
                <View className="flex-row items-center">
                  {/* Avatar */}
                  <View className="w-16 h-16 rounded-full bg-primary-500 items-center justify-center mr-4">
                    <Text className="text-2xl font-bold text-white">
                      {profile.studentName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  
                  {/* Profile Info */}
                  <View className="flex-1">
                    <Text className="text-xl font-bold text-neutral-900 mb-1">
                      {profile.studentName}
                    </Text>
                    <View className="flex-row items-center mb-1">
                      <Ionicons name="calendar-outline" size={14} color="#666666" />
                      <Text className="text-sm text-neutral-600 ml-1">
                        Joined {daysSinceRegistration === 0 ? 'today' : `${daysSinceRegistration} day${daysSinceRegistration > 1 ? 's' : ''} ago`}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <Ionicons name="finger-print-outline" size={14} color="#666666" />
                      <Text className="text-xs text-neutral-400 ml-1" numberOfLines={1}>
                        ID: {profile.studentId.substring(0, 8)}...
                      </Text>
                    </View>
                  </View>

                  {/* Status Badge */}
                  <View>
                    <Badge variant="success" size="sm">
                      Active
                    </Badge>
                  </View>
                </View>
              </CardContent>
            </Card>
          )}

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
              {recentActivities.length === 0 ? (
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
                <View>
                  {recentActivities.map((activity, index) => (
                    <View 
                      key={activity.id}
                      className={`flex-row items-center py-3 ${index < recentActivities.length - 1 ? 'border-b border-neutral-100' : ''}`}
                    >
                      {/* Icon */}
                      <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                        activity.type === 'lesson' ? 'bg-primary-100' : 'bg-success-100'
                      }`}>
                        <Ionicons 
                          name={activity.type === 'lesson' ? 'book' : 'checkmark-circle'} 
                          size={20} 
                          color={activity.type === 'lesson' ? '#2196F3' : '#4CAF50'} 
                        />
                      </View>

                      {/* Content */}
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-neutral-900 mb-1" numberOfLines={1}>
                          {activity.title}
                        </Text>
                        <View className="flex-row items-center">
                          <Text className="text-xs text-neutral-500">
                            {activity.subject} • {activity.topic}
                          </Text>
                          {activity.score !== undefined && (
                            <>
                              <Text className="text-xs text-neutral-400 mx-1">•</Text>
                              <Text className={`text-xs font-medium ${
                                activity.score >= 80 ? 'text-success-600' : 
                                activity.score >= 60 ? 'text-secondary-600' : 'text-error-600'
                              }`}>
                                {activity.score}%
                              </Text>
                            </>
                          )}
                        </View>
                      </View>

                      {/* Time */}
                      <View className="items-end ml-2">
                        <Text className="text-xs text-neutral-400">
                          {formatTimeAgo(activity.timestamp)}
                        </Text>
                        {activity.timeSpent && (
                          <Text className="text-xs text-neutral-400 mt-1">
                            {Math.round(activity.timeSpent / 60000)}m
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
