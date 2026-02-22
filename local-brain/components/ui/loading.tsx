import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';

interface LoadingProps {
  message?: string;
  size?: 'small' | 'large';
  color?: string;
  fullScreen?: boolean;
}

export function Loading({ 
  message = 'Loading...', 
  size = 'large',
  color = '#2196F3',
  fullScreen = true 
}: LoadingProps) {
  const containerClass = fullScreen 
    ? 'flex-1 justify-center items-center bg-neutral-50' 
    : 'justify-center items-center p-8';

  return (
    <View className={containerClass}>
      <ActivityIndicator size={size} color={color} />
      {message && (
        <Text className="mt-3 text-base text-neutral-600">
          {message}
        </Text>
      )}
    </View>
  );
}
