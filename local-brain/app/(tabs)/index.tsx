import { ScrollView, View, Text, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/src/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { SyncOrchestratorService } from '@/src/services/SyncOrchestratorService';
import * as SecureStore from 'expo-secure-store';


export default function HomeScreen() {
  const router = useRouter();
  const { isInitialized, error, studentId } = useApp();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      
      // Use studentId from AppContext
      if (!studentId) {
        Alert.alert(
          'Profile Not Loaded',
          'Student profile is not available. Please restart the app.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Get auth token from secure storage
      const authToken = await SecureStore.getItemAsync('authToken');
      if (!authToken) {
        Alert.alert(
          'Authentication Required',
          'Please restart the app to authenticate.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      const publicKey = 'demo_public_key';
      
      const syncService = new SyncOrchestratorService(studentId, authToken, publicKey);
      
      // Start sync (will work for both first-time and returning users)
      const status = await syncService.startSync();
      
      if (status.state === 'complete') {
        Alert.alert(
          'Sync Complete', 
          'Successfully synced with cloud-brain! Check Lessons and Quizzes tabs for new content.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Sync Status', 
          status.error || 'Sync completed with warnings',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.error('Sync error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync with cloud-brain';
      
      // Provide helpful error messages
      if (errorMessage.includes('No internet connectivity')) {
        Alert.alert(
          'No Internet Connection', 
          'Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      } else if (errorMessage.includes('Network request failed') || errorMessage.includes('Download info failed')) {
        Alert.alert(
          'API Not Available', 
          'The cloud-brain API is not currently available. Please ensure the cloud-brain service is deployed and the API URL is correct in your .env file.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Sync Error', 
          errorMessage,
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-50">
        <ScrollView>
          <View className="p-6">
            <Card variant="elevated" padding="lg">
              <Text className="text-2xl font-bold text-error-500 mb-3">Error</Text>
              <Text className="text-base text-neutral-700">{error}</Text>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!isInitialized) {
    return <Loading message="Initializing app..." />;
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="px-6 pt-6 pb-4">
          {/* Header */}
          <View className="mb-6">
            <Text className="text-4xl font-bold text-primary-700 mb-2">
              Sikshya Sathi
            </Text>
            <Text className="text-base text-neutral-600 mb-3">
              Your offline learning companion
            </Text>
            <Badge variant="success">✅ Ready to learn offline</Badge>
          </View>

          {/* Welcome Card */}
          <Card variant="elevated" padding="lg" style={{ marginBottom: 16 }}>
            <CardHeader>
              <Text className="text-xl font-semibold text-neutral-900">
                Welcome Back! 👋
              </Text>
            </CardHeader>
            <CardContent>
              <Text className="text-base text-neutral-700 leading-6">
                Continue your learning journey with quality education, available anytime, anywhere.
              </Text>
            </CardContent>
          </Card>

          {/* Sync Card */}
          <Card variant="elevated" padding="lg" style={{ marginBottom: 16, backgroundColor: '#E3F2FD' }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-4">
                <Text className="text-base font-semibold text-primary-700 mb-1">
                  Sync with Cloud
                </Text>
                <Text className="text-sm text-neutral-600">
                  Download new lessons and upload progress
                </Text>
              </View>
              <Button 
                onPress={handleSync}
                variant="primary"
                size="sm"
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <View className="flex-row items-center">
                    <Ionicons name="sync" size={16} color="white" />
                    <Text className="text-white ml-2">Syncing...</Text>
                  </View>
                ) : (
                  <View className="flex-row items-center">
                    <Ionicons name="cloud-download" size={16} color="white" />
                    <Text className="text-white ml-2">Sync Now</Text>
                  </View>
                )}
              </Button>
            </View>
          </Card>

          {/* Quick Actions */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-neutral-900 mb-3">
              Quick Actions
            </Text>
            
            <Card variant="elevated" padding="none" style={{ marginBottom: 12, overflow: 'hidden' }}>
              <View className="flex-row items-center p-4 active:bg-neutral-50">
                <View className="w-12 h-12 rounded-full bg-primary-100 items-center justify-center mr-4">
                  <Ionicons name="book" size={24} color="#2196F3" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-neutral-900 mb-1">
                    Start Learning
                  </Text>
                  <Text className="text-sm text-neutral-600">
                    Browse lessons and continue your journey
                  </Text>
                </View>
                <Button 
                  onPress={() => router.push('/lessons')}
                  variant="primary"
                  size="sm"
                >
                  Go
                </Button>
              </View>
            </Card>

            <Card variant="elevated" padding="none" style={{ overflow: 'hidden' }}>
              <View className="flex-row items-center p-4 active:bg-neutral-50">
                <View className="w-12 h-12 rounded-full bg-secondary-100 items-center justify-center mr-4">
                  <Ionicons name="checkmark-circle" size={24} color="#FF9800" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-neutral-900 mb-1">
                    Take a Quiz
                  </Text>
                  <Text className="text-sm text-neutral-600">
                    Test your knowledge
                  </Text>
                </View>
                <Button 
                  onPress={() => router.push('/quizzes')}
                  variant="secondary"
                  size="sm"
                >
                  Go
                </Button>
              </View>
            </Card>
          </View>

          {/* Features */}
          <Card variant="outlined" padding="lg">
            <CardHeader>
              <Text className="text-lg font-semibold text-neutral-900">
                Features
              </Text>
            </CardHeader>
            <CardContent>
              <View className="space-y-3">
                <View className="flex-row items-center mb-3">
                  <View className="w-10 h-10 rounded-full bg-primary-50 items-center justify-center mr-3">
                    <Ionicons name="cloud-offline" size={20} color="#2196F3" />
                  </View>
                  <Text className="flex-1 text-sm text-neutral-700">
                    Offline lessons and quizzes
                  </Text>
                </View>
                <View className="flex-row items-center mb-3">
                  <View className="w-10 h-10 rounded-full bg-success-50 items-center justify-center mr-3">
                    <Ionicons name="save" size={20} color="#4CAF50" />
                  </View>
                  <Text className="flex-1 text-sm text-neutral-700">
                    Automatic progress saving
                  </Text>
                </View>
                <View className="flex-row items-center mb-3">
                  <View className="w-10 h-10 rounded-full bg-secondary-50 items-center justify-center mr-3">
                    <Ionicons name="trending-up" size={20} color="#FF9800" />
                  </View>
                  <Text className="flex-1 text-sm text-neutral-700">
                    Adaptive learning paths
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-full bg-neutral-100 items-center justify-center mr-3">
                    <Ionicons name="bulb" size={20} color="#9E9E9E" />
                  </View>
                  <Text className="flex-1 text-sm text-neutral-700">
                    Progressive hints for quizzes
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
