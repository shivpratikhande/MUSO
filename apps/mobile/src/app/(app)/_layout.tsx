import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: t.c.background },
        headerTintColor: t.c.text,
        headerTitleStyle: { fontFamily: t.fonts.bodySemiBold },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: t.c.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="events/[id]/index" options={{ title: '', headerTransparent: true }} />
      <Stack.Screen name="events/new" options={{ title: 'New event', presentation: 'modal' }} />
      <Stack.Screen name="events/[id]/edit" options={{ title: 'Edit event' }} />
      <Stack.Screen name="events/[id]/lineup" options={{ title: 'Lineup' }} />
      <Stack.Screen name="events/[id]/schedule" options={{ title: 'Schedule' }} />
      <Stack.Screen name="events/mine" options={{ title: 'My events' }} />
      <Stack.Screen name="admin/review" options={{ title: 'Review queue' }} />
      <Stack.Screen name="artists/[id]" options={{ title: '', headerTransparent: true }} />
      <Stack.Screen name="profile/edit" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="profile/roles" options={{ title: 'Your roles' }} />
      <Stack.Screen name="profile/artist" options={{ title: 'Artist page' }} />
      <Stack.Screen name="profile/creator" options={{ title: 'Creator profile' }} />
      <Stack.Screen name="profile/organizer" options={{ title: 'Organizer details' }} />
      <Stack.Screen name="profile/interests" options={{ title: 'Interests' }} />
      <Stack.Screen name="compose" options={{ title: 'New moment', presentation: 'modal' }} />
      <Stack.Screen name="posts/[id]" options={{ title: '' }} />
      <Stack.Screen name="users/[id]" options={{ title: '' }} />
      <Stack.Screen name="hashtags/[tag]" options={{ title: '' }} />
      <Stack.Screen name="saved" options={{ title: 'Saved' }} />
      <Stack.Screen name="checkout" options={{ title: '', presentation: 'modal' }} />
      <Stack.Screen
        name="payments/return"
        options={{ title: '', presentation: 'transparentModal', animation: 'none' }}
      />
      <Stack.Screen name="pricing/[id]" options={{ title: 'Price', presentation: 'modal' }} />
      <Stack.Screen name="earnings" options={{ title: 'Earnings' }} />
      <Stack.Screen name="purchases" options={{ title: 'Purchases' }} />
      <Stack.Screen name="library" options={{ title: 'Library' }} />
    </Stack>
  );
}
