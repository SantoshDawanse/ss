/**
 * Lesson Display Component
 * Renders lesson content with support for Devanagari script and responsive layouts.
 * Requirements: 3.1, 15.3
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Lesson, LessonSection } from '../models';

interface LessonDisplayProps {
  lesson: Lesson;
  onComplete?: () => void;
}

export const LessonDisplay: React.FC<LessonDisplayProps> = ({ lesson }) => {
  const renderSection = (section: LessonSection, index: number) => {
    return (
      <View key={index} style={styles.section}>
        <Text style={styles.sectionType}>{getSectionTypeLabel(section.type)}</Text>
        <Text style={styles.content}>{section.content}</Text>
        {section.media && section.media.length > 0 && (
          <View style={styles.mediaContainer}>
            {section.media.map((media, mediaIndex) => (
              <View key={mediaIndex} style={styles.mediaItem}>
                {media.type === 'image' && (
                  <Image
                    source={{ uri: media.url }}
                    style={styles.image}
                    resizeMode="contain"
                    accessible={true}
                    accessibilityLabel={media.alt || 'Lesson image'}
                  />
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>{lesson.title}</Text>
        <View style={styles.metadata}>
          <Text style={styles.metadataText}>
            {lesson.subject} • {lesson.topic}
          </Text>
          <Text style={styles.metadataText}>
            {lesson.estimatedMinutes} minutes • {lesson.difficulty}
          </Text>
        </View>
      </View>

      {lesson.sections.map((section, index) => renderSection(section, index))}
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

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    padding: isTablet ? 24 : 16,
  },
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: isTablet ? 28 : 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
    // Support for Devanagari script
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  metadata: {
    flexDirection: 'column',
    gap: 4,
  },
  metadataText: {
    fontSize: 14,
    color: '#666666',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  section: {
    marginBottom: 24,
  },
  sectionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    marginBottom: 8,
    textTransform: 'uppercase',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  content: {
    fontSize: isTablet ? 18 : 16,
    lineHeight: isTablet ? 28 : 24,
    color: '#333333',
    // Support for Devanagari script rendering
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  mediaContainer: {
    marginTop: 16,
  },
  mediaItem: {
    marginBottom: 12,
  },
  image: {
    width: '100%',
    height: isTablet ? 300 : 200,
    borderRadius: 8,
  },
});
