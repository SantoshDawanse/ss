/**
 * Feedback Display Component
 * Shows immediate feedback after quiz answers with explanations and encouragement.
 * Requirement 3.7: Provide immediate feedback
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Animated,
} from 'react-native';
import { QuizFeedback } from '../services';

interface FeedbackDisplayProps {
  feedback: QuizFeedback;
  onRequestHint?: () => void;
  onContinue: () => void;
  showHintButton?: boolean;
}

export const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({
  feedback,
  onRequestHint,
  onContinue,
  showHintButton = false,
}) => {
  const [fadeAnim] = useState(new Animated.Value(0));

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View
        style={[
          styles.feedbackCard,
          feedback.correct ? styles.feedbackCardCorrect : styles.feedbackCardIncorrect,
        ]}
      >
        {/* Result Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{feedback.correct ? '✓' : '✗'}</Text>
        </View>

        {/* Encouragement Message */}
        <Text
          style={[
            styles.encouragement,
            feedback.correct ? styles.encouragementCorrect : styles.encouragementIncorrect,
          ]}
        >
          {feedback.encouragement}
        </Text>

        {/* Explanation */}
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationLabel}>व्याख्या / Explanation:</Text>
          <Text style={styles.explanationText}>{feedback.explanation}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {!feedback.correct && showHintButton && feedback.nextHintLevel && (
            <TouchableOpacity
              style={styles.hintButton}
              onPress={onRequestHint}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Request hint"
            >
              <Text style={styles.hintButtonText}>
                संकेत चाहिन्छ / Need Hint (Level {feedback.nextHintLevel})
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.continueButton}
            onPress={onContinue}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.continueButtonText}>
              {feedback.correct ? 'अगाडि बढ्नुहोस् / Continue' : 'पुन: प्रयास गर्नुहोस् / Try Again'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

interface HintDisplayProps {
  hintText: string;
  level: number;
  onClose: () => void;
}

export const HintDisplay: React.FC<HintDisplayProps> = ({ hintText, level, onClose }) => {
  const [fadeAnim] = useState(new Animated.Value(0));

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.hintContainer, { opacity: fadeAnim }]}>
      <View style={styles.hintCard}>
        <View style={styles.hintHeader}>
          <Text style={styles.hintTitle}>संकेत / Hint (Level {level})</Text>
        </View>

        <Text style={styles.hintText}>{hintText}</Text>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Close hint"
        >
          <Text style={styles.closeButtonText}>बन्द गर्नुहोस् / Close</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
  },
  feedbackCard: {
    width: '100%',
    maxWidth: isTablet ? 600 : 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  feedbackCardCorrect: {
    borderLeftWidth: 8,
    borderLeftColor: '#4CAF50',
  },
  feedbackCardIncorrect: {
    borderLeftWidth: 8,
    borderLeftColor: '#F44336',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 64,
    fontWeight: 'bold',
  },
  encouragement: {
    fontSize: isTablet ? 22 : 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  encouragementCorrect: {
    color: '#4CAF50',
  },
  encouragementIncorrect: {
    color: '#F44336',
  },
  explanationContainer: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  explanationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
    textTransform: 'uppercase',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  explanationText: {
    fontSize: isTablet ? 18 : 16,
    lineHeight: isTablet ? 26 : 24,
    color: '#333333',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  buttonContainer: {
    gap: 12,
  },
  hintButton: {
    backgroundColor: '#FF9800',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  hintButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  continueButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  hintContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
  },
  hintCard: {
    width: '100%',
    maxWidth: isTablet ? 600 : 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  hintHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#FF9800',
  },
  hintTitle: {
    fontSize: isTablet ? 22 : 20,
    fontWeight: 'bold',
    color: '#FF9800',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  hintText: {
    fontSize: isTablet ? 18 : 16,
    lineHeight: isTablet ? 26 : 24,
    color: '#333333',
    marginBottom: 24,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
  closeButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif',
    }),
  },
});
