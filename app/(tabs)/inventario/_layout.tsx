import { Stack } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';

export default function InventarioStackLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Inventário' }} />
      <Stack.Screen name="[id]" options={{ title: 'Contagem' }} />
    </Stack>
  );
}
