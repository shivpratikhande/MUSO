import { HEARTBEAT_INTERVAL_MS } from '@muso/shared';
import type { VideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { api } from '@/services/api';
import { getDeviceId } from './device-id';

/**
 * Reports playback to the server while a video is on screen. The server measures elapsed time
 * between heartbeats and decides what counts — the app never sends watch totals. Failures are
 * silent: tracking must never interrupt playback.
 */
export function useWatchTracking(
  player: VideoPlayer,
  postId: string | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !postId) return;
    let sessionId: string | null = null;
    let starting = false;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const playing = player.playing;
      try {
        if (!sessionId) {
          if (!playing || starting) return;
          starting = true;
          const s = await api.watch.start({ postId, deviceId: await getDeviceId() });
          sessionId = s.sessionId;
          starting = false;
          return;
        }
        const res = await api.watch.heartbeat(sessionId, {
          positionMs: Math.max(0, Math.round(player.currentTime * 1000)),
          playing,
          foreground: AppState.currentState === 'active',
        });
        if (res.status !== 'ACTIVE') sessionId = null; // ended elsewhere or flagged: start fresh next time
      } catch {
        starting = false;
      }
    };

    const id = setInterval(() => void tick(), HEARTBEAT_INTERVAL_MS);
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
      if (sessionId) void api.watch.end(sessionId).catch(() => undefined);
    };
  }, [player, postId, enabled]);
}
