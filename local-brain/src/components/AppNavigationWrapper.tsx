/**
 * AppNavigationWrapper - Handles navigation based on profile state
 * 
 * This component checks if a student profile exists and navigates to
 * onboarding if no profile is found, or shows a loading screen while
 * the profile is being loaded.
 */

import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useApp } from '../contexts/AppContext';

export function AppNavigationWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { studentId, isProfileLoaded } = useApp();

  useEffect(() => {
    if (!isProfileLoaded) {
      // Still loading profile, don't navigate yet
      return;
    }

    const inOnboarding = segments[0] === 'onboarding';

    if (!studentId && !inOnboarding) {
      // No profile and not on onboarding screen - navigate to onboarding
      router.replace('/onboarding');
    } else if (studentId && inOnboarding) {
      // Profile exists but on onboarding screen - navigate to main app
      router.replace('/(tabs)');
    }
  }, [studentId, isProfileLoaded, segments]);

  // Show loading screen while profile is being loaded
  if (!isProfileLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={{ marginTop: 16, fontSize: 16, color: '#666' }}>
          Loading...
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}
