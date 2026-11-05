import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppText,
  Avatar,
  Button,
  Card,
  ErrorState,
  ListRow,
  LoadingState,
  Pill,
} from '@/components/ui';
import { signOut } from '@/features/auth/session';
import { useSession } from '@/features/auth/session-store';
import { ROLE_COPY } from '@/features/profile/forms/RolesForm';
import { useMe } from '@/features/profile/use-me';
import { errorMessage } from '@/services/api';
import { useTheme } from '@/theme';

export default function ProfileScreen() {
  const t = useTheme();
  const me = useMe();
  const emailVerified = useSession((s) => s.user?.emailVerified ?? false);
  const [signingOut, setSigningOut] = useState(false);

  const body = () => {
    if (me.isPending) return <LoadingState />;
    if (me.isError)
      return <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />;
    const p = me.data;
    const has = (r: string) => p.roles.includes(r as never);
    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
          <Avatar url={p.avatarUrl} name={p.displayName} size={84} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title">{p.displayName ?? 'Your profile'}</AppText>
            {p.username ? <AppText tone="muted">@{p.username}</AppText> : null}
            {p.city ? (
              <AppText variant="caption" tone="muted">
                {p.city}
                {p.country ? `, ${p.country}` : ''}
                {p.showLocation ? '' : ' · hidden'}
              </AppText>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: t.space.xs, flexWrap: 'wrap' }}>
          {p.roles.map((r) => (
            <Pill
              key={r}
              label={r === 'ADMIN' ? 'Admin' : ROLE_COPY[r].title}
              tone={r === 'ADMIN' ? 'accent' : 'neutral'}
            />
          ))}
        </View>
        {p.bio ? <AppText>{p.bio}</AppText> : null}
        {p.links.map((l) => (
          <ListRow
            key={l.url}
            title={l.label}
            subtitle={l.url.replace(/^https?:\/\//, '')}
            onPress={() => void Linking.openURL(l.url)}
          />
        ))}

        {!emailVerified ? (
          <Card inverse>
            <AppText variant="heading" tone="inverse">
              Verify your email
            </AppText>
            <AppText variant="caption" tone="inverse">
              Required before you can publish events, earn or buy.
            </AppText>
            <Button label="Enter code" onPress={() => router.push('/verify-email')} />
          </Card>
        ) : null}

        {has('ARTIST') && p.artistProfile ? (
          <Card>
            <AppText variant="label" tone="muted">
              Artist
            </AppText>
            <AppText variant="title">{p.artistProfile.stageName}</AppText>
            <AppText variant="caption" tone="muted">
              {p.artistProfile.genres.map((g) => g.name).join(' · ') || 'No genres yet'}
            </AppText>
            <Button
              label="View my artist page"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/artists/[id]', params: { id: p.artistProfile!.id } })
              }
            />
          </Card>
        ) : null}

        {has('ORGANIZER') ? (
          <Card>
            <AppText variant="label" tone="muted">
              Organizer
            </AppText>
            <AppText variant="title">{p.organizerProfile?.organizationName ?? 'Organizer'}</AppText>
            <Button
              label="My events"
              variant="secondary"
              onPress={() => router.push('/events/mine')}
            />
            <Button
              label="Create event"
              variant="ghost"
              onPress={() => router.push('/events/new')}
            />
          </Card>
        ) : null}

        {has('ADMIN') ? (
          <Card>
            <AppText variant="label" tone="muted">
              Admin
            </AppText>
            <Button
              label="Event review queue"
              variant="secondary"
              onPress={() => router.push('/admin/review')}
            />
          </Card>
        ) : null}

        <View>
          <AppText variant="label" tone="muted">
            Settings
          </AppText>
          <ListRow
            title="Edit profile"
            subtitle="Photo, name, bio, links, privacy"
            onPress={() => router.push('/profile/edit')}
          />
          <ListRow
            title="Your roles"
            subtitle={p.roles
              .filter((r) => r !== 'ADMIN')
              .map((r) => ROLE_COPY[r as 'SUPPORTER'].title)
              .join(', ')}
            onPress={() => router.push('/profile/roles')}
          />
          {has('ARTIST') ? (
            <ListRow
              title="Artist page"
              subtitle="Stage name, cover, genres, fan recording policy"
              onPress={() => router.push('/profile/artist')}
            />
          ) : null}
          {has('CREATOR') ? (
            <ListRow
              title="Creator profile"
              subtitle="What you shoot, portfolio"
              onPress={() => router.push('/profile/creator')}
            />
          ) : null}
          {has('ORGANIZER') ? (
            <ListRow
              title="Organizer details"
              subtitle="Organization and contact"
              onPress={() => router.push('/profile/organizer')}
            />
          ) : null}
        </View>

        <Button
          label="Sign out"
          variant="ghost"
          loading={signingOut}
          onPress={async () => {
            setSigningOut(true);
            await signOut();
          }}
        />
      </>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.c.background }}>
      <ScrollView
        contentContainerStyle={{ padding: t.space.xl, gap: t.space.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={me.isRefetching}
            onRefresh={() => void me.refetch()}
            tintColor={t.c.text}
          />
        }
      >
        <AppText variant="label" tone="muted">
          Profile
        </AppText>
        {body()}
      </ScrollView>
    </SafeAreaView>
  );
}
