import React from 'react';
import { View, Text } from 'react-native';

interface ProgressProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function Progress({
  value,
  max = 100,
  showLabel = false,
  size = 'md',
  variant = 'default',
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const heightClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const colorClasses = {
    default: 'bg-primary-500',
    success: 'bg-success-500',
    warning: 'bg-secondary-500',
    error: 'bg-error-500',
  };

  return (
    <View className="w-full">
      <View className={`w-full bg-neutral-200 rounded-full overflow-hidden ${heightClasses[size]}`}>
        <View
          className={`${heightClasses[size]} ${colorClasses[variant]} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </View>
      {showLabel && (
        <Text className="text-xs text-neutral-600 mt-1 text-right">
          {Math.round(percentage)}%
        </Text>
      )}
    </View>
  );
}
