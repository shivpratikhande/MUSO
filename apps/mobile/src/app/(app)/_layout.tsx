import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="verify-email"
        options={{
          presentation: 'modal',
          headerShown: true,
          headerTitle: '',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: t.c.background },
          headerTintColor: t.c.text,
        }}
      />
    </Stack>
  );
}
