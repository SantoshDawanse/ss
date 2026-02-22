import React from 'react';
import { View, Text } from 'react-native';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  size?: 'sm' | 'md' | 'lg';
}

export function Badge({ children, variant = 'default', size = 'md' }: BadgeProps) {
  const variantClasses = {
    default: 'bg-neutral-100',
    success: 'bg-success-50',
    error: 'bg-error-50',
    warning: 'bg-secondary-50',
    info: 'bg-primary-50',
  };

  const textVariantClasses = {
    default: 'text-neutral-700',
    success: 'text-success-700',
    error: 'text-error-700',
    warning: 'text-secondary-700',
    info: 'text-primary-700',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5',
    md: 'px-2.5 py-1',
    lg: 'px-3 py-1.5',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <View className={`rounded-full ${variantClasses[variant]} ${sizeClasses[size]} self-start`}>
      <Text className={`font-medium ${textVariantClasses[variant]} ${textSizeClasses[size]}`}>
        {children}
      </Text>
    </View>
  );
}
