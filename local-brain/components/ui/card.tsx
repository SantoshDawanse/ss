import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ 
  children, 
  variant = 'default', 
  padding = 'md',
  style,
  ...props 
}: CardProps) {
  const variantClasses = {
    default: 'bg-white',
    elevated: 'bg-white shadow-lg',
    outlined: 'bg-white border border-neutral-200',
  };

  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <View
      className={`rounded-xl ${variantClasses[variant]} ${paddingClasses[padding]}`}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ children, ...props }: ViewProps) {
  return (
    <View className="mb-3" {...props}>
      {children}
    </View>
  );
}

export function CardContent({ children, ...props }: ViewProps) {
  return (
    <View {...props}>
      {children}
    </View>
  );
}

export function CardFooter({ children, ...props }: ViewProps) {
  return (
    <View className="mt-3 pt-3 border-t border-neutral-100" {...props}>
      {children}
    </View>
  );
}
