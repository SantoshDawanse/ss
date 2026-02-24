/**
 * Onboarding Screen Component
 * 
 * Displays welcome message and collects student name during first launch.
 * 
 * Features:
 * - Welcome message and app description
 * - Text input for student name with real-time validation
 * - Submit button (disabled when name is invalid)
 * - Loading indicator during registration
 * - Error message display for registration failures
 * - Non-blocking notification for registration issues
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.5, 5.6
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { StudentProfileService } from '@/src/services/StudentProfileService';
import { useApp } from '@/src/contexts/AppContext';

export default function OnboardingScreen() {
  const router = useRouter();
  const { initializeServices } = useApp();
  const [studentName, setStudentName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time validation: enable submit button only when name has non-whitespace characters
  const isNameValid = studentName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isNameValid) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Create profile using StudentProfileService
      const profileService = StudentProfileService.getInstance();
      const profile = await profileService.createProfile(studentName);

      // Initialize services with the new studentId
      await initializeServices(profile.studentId);

      // Navigate to main app
      // Note: Cloud registration happens in background, failures don't block navigation
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Profile creation failed:', err);
      
      // Extract user-friendly error message
      let errorMessage = 'Failed to create profile. Please try again.';
      
      if (err instanceof Error) {
        // Check for specific error types
        if (err.message.includes('secure storage') || err.message.includes('unlock your device')) {
          // SecureStore error
          errorMessage = err.message;
        } else if (err.message.includes('corrupted')) {
          // Corrupted profile error
          errorMessage = err.message;
        } else if (err.message.includes('UUID generation')) {
          // UUID generation error
          errorMessage = 'Unable to create profile. Please try again.';
        } else if (err.message.includes('empty') || err.message.includes('name')) {
          // Name validation error
          errorMessage = 'Please enter a valid name.';
        } else {
          // Generic error with original message
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-8 pb-6 justify-center">
            {/* App Icon/Logo */}
            <View className="items-center mb-8">
              <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-4">
                <Ionicons name="school" size={48} color="#2196F3" />
              </View>
              <Text className="text-4xl font-bold text-primary-700 mb-2">
                Sikshya Sathi
              </Text>
              <Text className="text-base text-neutral-600 text-center">
                Your offline learning companion
              </Text>
            </View>

            {/* Welcome Card */}
            <Card variant="elevated" padding="lg" style={{ marginBottom: 24 }}>
              <CardHeader>
                <Text className="text-2xl font-bold text-neutral-900 mb-2">
                  Welcome! 👋
                </Text>
              </CardHeader>
              <CardContent>
                <Text className="text-base text-neutral-700 leading-6 mb-4">
                  Sikshya Sathi brings quality education to your fingertips, 
                  available anytime, anywhere - even without internet.
                </Text>
                <Text className="text-base text-neutral-700 leading-6">
                  Let's get started by creating your learning profile.
                </Text>
              </CardContent>
            </Card>

            {/* Name Input */}
            <View className="mb-6">
              <Input
                label="Your Name"
                placeholder="Enter your name"
                value={studentName}
                onChangeText={setStudentName}
                error={error || undefined}
                helperText={!error ? "This helps us personalize your learning experience" : undefined}
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus={true}
                editable={!isSubmitting}
                leftIcon={<Ionicons name="person" size={20} color="#9E9E9E" />}
              />
            </View>

            {/* Submit Button */}
            <Button
              onPress={handleSubmit}
              variant="primary"
              size="lg"
              disabled={!isNameValid || isSubmitting}
              loading={isSubmitting}
              fullWidth
            >
              {isSubmitting ? 'Creating Profile...' : 'Get Started'}
            </Button>

            {/* Features Preview */}
            <View className="mt-8">
              <Text className="text-sm font-semibold text-neutral-700 mb-3">
                What you'll get:
              </Text>
              <View className="space-y-2">
                <View className="flex-row items-center mb-2">
                  <View className="w-8 h-8 rounded-full bg-primary-50 items-center justify-center mr-3">
                    <Ionicons name="cloud-offline" size={16} color="#2196F3" />
                  </View>
                  <Text className="flex-1 text-sm text-neutral-600">
                    Learn offline without internet
                  </Text>
                </View>
                <View className="flex-row items-center mb-2">
                  <View className="w-8 h-8 rounded-full bg-success-50 items-center justify-center mr-3">
                    <Ionicons name="trending-up" size={16} color="#4CAF50" />
                  </View>
                  <Text className="flex-1 text-sm text-neutral-600">
                    Track your progress automatically
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-full bg-secondary-50 items-center justify-center mr-3">
                    <Ionicons name="bulb" size={16} color="#FF9800" />
                  </View>
                  <Text className="flex-1 text-sm text-neutral-600">
                    Get adaptive learning paths
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
