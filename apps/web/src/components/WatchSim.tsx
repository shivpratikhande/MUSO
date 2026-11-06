'use client';

import { useEffect, useRef, useState } from 'react';
import { Toggle } from './Controls';
import { StageArt } from './icons';

const CLIP_SECONDS = 42;
const BEAT_EVERY = 5;

interface Beat {
  id: number;
  ok: boolean;
  credit: number;
  text: string;
}

/**
 * Plays a fake clip and sends a "heartbeat" every 5 s. Each beat is credited only if it
 * passes the same kinds of checks the server runs (background, position jump, self-view…).
 */
export function WatchSim() {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [played, setPlayed] = useState(0);
  const [qualified, setQualified] = useState(0);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [background, setBackground] = useState(false);
  const [selfView, setSelfView] = useState(false);
  const [human, setHuman] = useState(true);

  // Mutable state the 1-second ticker reads, so the interval never sees stale values.
  const s = useRef({ pos: 0, played: 0, sinceBeat: 0, qualified: 0, jumped: false, nextId: 0 });
  const flags = useRef({ background, selfView, human });
  useEffect(() => {
    flags.current = { background, selfView, human };
  }, [background, selfView, human]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const st = s.current;
      st.pos += 1;
      st.played += 1;
      st.sinceBeat += 1;
      const newBeats: Beat[] = [];

      if (st.sinceBeat >= BEAT_EVERY) {
        st.sinceBeat = 0;
        const f = flags.current;
        let reason = '';
        if (f.background) reason = 'Excluded: app was in the background';
        else if (st.jumped) reason = 'Excluded: position jumped';
        else if (f.selfView) reason = "Excluded: you can't earn from your own views";
        else if (!f.human) reason = "Excluded: viewer isn't verified";
        else if (st.qualified >= CLIP_SECONDS) reason = 'Excluded: you already watched the full clip';
        st.jumped = false;
        if (reason) newBeats.push({ id: st.nextId++, ok: false, credit: 0, text: reason });
        else {
          const credit = Math.min(BEAT_EVERY, CLIP_SECONDS - st.qualified);
          st.qualified += credit;
          newBeats.push({ id: st.nextId++, ok: true, credit, text: `Server measured ${credit}s on screen. Credited.` });
        }
      }

      if (st.pos >= CLIP_SECONDS) {
        st.pos = CLIP_SECONDS;
        setPlaying(false);
      }
      setPos(st.pos);
      setPlayed(st.played);
      setQualified(st.qualified);
      if (newBeats.length) setBeats((b) => [...newBeats, ...b]);
    }, 1000);
    return () => clearInterval(timer);
  }, [playing]);

  const toggle = () => {
    if (!playing && s.current.pos >= CLIP_SECONDS) {
      s.current.pos = 0;
      setPos(0);
    }
    setPlaying((p) => !p);
  };

  const skip = () => {
    s.current.pos = Math.min(CLIP_SECONDS - 1, s.current.pos + 15);
    s.current.jumped = true;
    setPos(s.current.pos);
  };

  const reset = () => {
    setPlaying(false);
    s.current = { pos: 0, played: 0, sinceBeat: 0, qualified: 0, jumped: false, nextId: 0 };
    setPos(0);
    setPlayed(0);
    setQualified(0);
    setBeats([]);
  };

  return (
    <div className="sim reveal">
      <div className="sim-player card">
        <div className={`sim-video${playing ? ' playing' : ''}${background ? ' bg' : ''}`}>
          <StageArt />
          <button className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
            <svg viewBox="0 0 24 24" className="i-play" aria-hidden="true">
              <path d="M8 5v14l11-7Z" />
            </svg>
            <svg viewBox="0 0 24 24" className="i-pause" aria-hidden="true">
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
            </svg>
          </button>
          <div className="sim-progress">
            <i style={{ width: `${(pos / CLIP_SECONDS) * 100}%` }} />
          </div>
        </div>
        <div className="sim-toggles">
          <Toggle checked={background} onChange={setBackground} label="App in background" />
          <Toggle checked={selfView} onChange={setSelfView} label="It's my own clip" />
          <Toggle checked={human} onChange={setHuman} label="Verified human" />
          <button className="btn btn-sm btn-white" onClick={skip} disabled={!playing}>
            Skip ahead 15s
          </button>
        </div>
      </div>
      <div className="sim-side">
        <div className="meters">
          <div className="meter card">
            <small>Played</small>
            <b>{played}s</b>
          </div>
          <div className="meter card meter-lime">
            <small>Qualified</small>
            <b>{qualified}s</b>
          </div>
        </div>
        <div className="log card">
          <div className="log-head">
            <span>Heartbeats</span>
            <button className="link" onClick={reset}>
              Reset
            </button>
          </div>
          <ol aria-live="polite">
            {beats.length === 0 && <li className="log-empty">Press play to start sending heartbeats.</li>}
            {beats.map((b) => (
              <li key={b.id} className={b.ok ? 'ok' : 'no'}>
                <b>+{b.credit}s</b>
                <span>{b.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
