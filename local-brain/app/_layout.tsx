import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppProvider } from '@/src/contexts/AppContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen 
            name="lesson-view" 
            options={{ 
              title: 'Lesson',
              headerShown: true,
              headerStyle: {
                backgroundColor: '#FFFFFF',
              },
              headerTintColor: '#2196F3',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }} 
          />
          <Stack.Screen 
            name="quiz-view" 
            options={{ 
              title: 'Quiz',
              headerShown: true,
              headerStyle: {
                backgroundColor: '#FFFFFF',
              },
              headerTintColor: '#2196F3',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }} 
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppProvider>
  );
}
