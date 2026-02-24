/**
 * Lesson View Screen - Display lesson content
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LessonDisplay } from '@/src/components/LessonDisplay';
import { useApp } from '@/src/contexts/AppContext';
import { Lesson } from '@/src/models';

export default function LessonViewScreen() {
  const router = useRouter();
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { contentService, performanceService, studentId } = useApp();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (lessonId && contentService && performanceService) {
      loadLesson();
    }
  }, [lessonId, contentService, performanceService]);

  const loadLesson = async () => {
    if (!studentId) {
      console.warn('Cannot load lesson: studentId is null');
      Alert.alert('Error', 'Student profile not loaded');
      setLoading(false);
      return;
    }

    try {
      const lessonData = await contentService!.getLessonById(lessonId);
      if (lessonData) {
        setLesson(lessonData);
        
        // Track lesson start
        await performanceService!.trackLessonStart(
          studentId,
          lessonId,
          lessonData.subject,
          lessonData.topic
        );
      }
    } catch (error) {
      console.error('Error loading lesson:', error);
      Alert.alert('Error', 'Failed to load lesson');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!lesson || !performanceService || !studentId) {
      console.warn('Cannot complete lesson: missing required data');
      return;
    }

    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    try {
      // Track lesson completion
      await performanceService.trackLessonComplete(
        studentId,
        lessonId,
        lesson.subject,
        lesson.topic,
        timeSpent
      );

      Alert.alert(
        'Lesson Complete!',
        'Great job! Ready for a quiz?',
        [
          { text: 'Back to Lessons', onPress: () => router.back() },
          { text: 'Take Quiz', onPress: () => router.push('/quizzes') },
        ]
      );
    } catch (error) {
      console.error('Error completing lesson:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!lesson) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LessonDisplay lesson={lesson} onComplete={handleComplete} />
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
