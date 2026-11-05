import type { MediaType } from '@muso/shared';
import { create } from 'zustand';

export interface Draft {
  uri: string;
  type: MediaType;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  durationMs: number | null;
  /** Stable per draft so retries never create duplicate posts. */
  clientRequestId: string;
  eventId: string | null;
}

interface DraftState {
  draft: Draft | null;
  set: (d: Draft) => void;
  clear: () => void;
}

/** The capture being composed. Lives outside navigation params (URIs can be long). */
export const useDraft = create<DraftState>((set) => ({
  draft: null,
  set: (draft) => set({ draft }),
  clear: () => set({ draft: null }),
}));
