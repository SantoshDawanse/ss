import { View, type ViewProps } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ThemedViewProps = ViewProps;

export function ThemedView({ style, ...rest }: ThemedViewProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View
      style={[
        { backgroundColor: isDark ? '#000000' : '#FFFFFF' },
        style,
      ]}
      {...rest}
    />
  );
}
