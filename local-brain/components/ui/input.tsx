import React from 'react';
import { TextInput, View, Text, TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  style,
  ...props
}: InputProps) {
  return (
    <View className="w-full">
      {label && (
        <Text className="text-sm font-medium text-neutral-700 mb-1.5">
          {label}
        </Text>
      )}
      <View
        className={`flex-row items-center border rounded-lg px-3 py-2.5 ${
          error ? 'border-error-500' : 'border-neutral-300'
        } bg-white`}
      >
        {leftIcon && <View className="mr-2">{leftIcon}</View>}
        <TextInput
          className="flex-1 text-base text-neutral-900"
          placeholderTextColor="#9E9E9E"
          style={style}
          {...props}
        />
        {rightIcon && <View className="ml-2">{rightIcon}</View>}
      </View>
      {error && (
        <Text className="text-xs text-error-500 mt-1">
          {error}
        </Text>
      )}
      {helperText && !error && (
        <Text className="text-xs text-neutral-500 mt-1">
          {helperText}
        </Text>
      )}
    </View>
  );
}
