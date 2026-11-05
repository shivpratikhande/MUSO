import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import type { ViewStyle } from 'react-native';

/**
 * Feed/detail video. In the feed it autoplays muted when `active` (most visible item) and
 * pauses otherwise; on the detail screen it shows native controls with sound.
 */
export function VideoPlayer({
  uri,
  active,
  controls = false,
  style,
}: {
  uri: string;
  active: boolean;
  controls?: boolean;
  style?: ViewStyle;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = !controls;
  });
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
