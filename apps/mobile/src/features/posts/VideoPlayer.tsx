import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import { useWatchTracking } from '@/features/rewards/use-watch-tracking';

/**
 * Feed/detail video. In the feed it autoplays muted when `active` (most visible item) and
 * pauses otherwise; on the detail screen it shows native controls with sound.
 */
export function VideoPlayer({
  uri,
  active,
  controls = false,
  style,
  trackPostId,
}: {
  uri: string;
  active: boolean;
  controls?: boolean;
  style?: ViewStyle;
  trackPostId?: string;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = !controls;
  });
  // Reward tracking: only for published, unlocked videos someone else posted (caller decides).
  useWatchTracking(player, trackPostId, active && !!trackPostId);
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={controls}
      fullscreenOptions={{ enable: controls }}
      allowsPictureInPicture={false}
    />
  );
}
