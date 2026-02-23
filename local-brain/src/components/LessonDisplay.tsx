/**
 * Lesson Display Component
 * Renders lesson content with support for Devanagari script and responsive layouts.
 * Requirements: 3.1, 15.3
 */

import React from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Lesson, LessonSection } from '../models';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ionicons } from '@expo/vector-icons';

interface LessonDisplayProps {
  lesson: Lesson;
  onComplete?: () => void;
}

export const LessonDisplay: React.FC<LessonDisplayProps> = ({ lesson, onComplete }) => {
  const renderSection = (section: LessonSection, index: number) => {
    return (
      <Card key={index} variant="elevated" padding="lg" style={{ marginBottom: 16 }}>
        <CardHeader>
          <Badge variant="info" size="sm">
            {getSectionTypeLabel(section.type)}
          </Badge>
        </CardHeader>
        <CardContent>
          <Text className="text-base text-neutral-800 leading-6">
            {section.content}
          </Text>
          {section.media && section.media.length > 0 && (
            <View className="mt-4">
              {section.media.map((media, mediaIndex) => (
                <View key={mediaIndex} className="mb-3">
                  {media.type === 'image' && (
                    <Image
                      source={{ uri: media.url }}
                      className="w-full h-48 rounded-lg"
                      resizeMode="contain"
                      accessible={true}
                      accessibilityLabel={media.alt || 'Lesson image'}
                    />
                  )}
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <ScrollView className="flex-1 bg-neutral-50">
      <View className="p-4">
        {/* Header Card */}
        <Card variant="elevated" padding="lg" style={{ marginBottom: 16 }}>
          <Text className="text-3xl font-bold text-neutral-900 mb-3">
            {lesson.title}
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
            <Badge variant="default">{lesson.subject}</Badge>
            <Badge variant="info">{lesson.topic}</Badge>
            <Badge variant="warning">{lesson.difficulty}</Badge>
          </View>
          <Text className="text-sm text-neutral-600 mt-2">
            ⏱️ {lesson.estimatedMinutes} minutes
          </Text>
        </Card>

        {/* Sections */}
        {lesson.sections.map((section, index) => renderSection(section, index))}

        {/* Complete Button */}
        {onComplete && (
          <Card variant="elevated" padding="lg" style={{ marginTop: 8 }}>
            <Button 
              onPress={onComplete}
              variant="primary"
              size="lg"
              fullWidth
            >
              <View className="flex-row items-center justify-center">
                <Ionicons name="checkmark-circle" size={20} color="white" />
                <Text className="text-white font-semibold ml-2">
                  Complete Lesson
                </Text>
              </View>
            </Button>
          </Card>
        )}
      </View>
    </ScrollView>
  );
};

const getSectionTypeLabel = (type: string): string => {
  switch (type) {
    case 'explanation':
      return 'व्याख्या / Explanation';
    case 'example':
      return 'उदाहरण / Example';
    case 'practice':
      return 'अभ्यास / Practice';
    default:
      return type;
  }
};
