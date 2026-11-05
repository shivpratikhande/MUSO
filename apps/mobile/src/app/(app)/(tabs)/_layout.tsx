import { useQuery } from '@tanstack/react-query';
import { NativeTabs } from 'expo-router/native-tabs';
import { api } from '@/services/api';
import { useTheme } from '@/theme';

/** The five primary destinations. Order and naming follow the product spec. */
export default function TabsLayout() {
  const t = useTheme();
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.notifications.unreadCount(),
    refetchInterval: 30_000,
  });
  const count = unread.data?.count ?? 0;
  return (
    <NativeTabs tintColor={t.c.text} labelStyle={{ selected: { color: t.c.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} md="explore" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Label>Events</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'ticket', selected: 'ticket.fill' }}
          md="confirmation_number"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create">
        <NativeTabs.Trigger.Label>Create</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'camera', selected: 'camera.fill' }}
          md="photo_camera"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        {count > 0 ? (
          <NativeTabs.Trigger.Badge>{count > 99 ? '99+' : String(count)}</NativeTabs.Trigger.Badge>
        ) : null}
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bell', selected: 'bell.fill' }}
          md="notifications"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
