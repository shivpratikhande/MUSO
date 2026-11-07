"""
Original backing track for the explainer: 120 BPM electronic build, A minor (Am-F-C-G).
  python video/music.py            (numpy + scipy) -> video/out/music.wav, 90 s, 48 kHz stereo
Sections follow the scenes (2 s bars): 0-12 intro, 12 drop, 54 breath, 66 full, 78 final, 86 outro.
"""
import os
import wave

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48_000
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
LEN = 90.0
N = int(LEN * SR)
rng = np.random.default_rng(7)
OUT = os.path.join(os.path.dirname(__file__), "out", "music.wav")

L = np.zeros(N)
R = np.zeros(N)


def t_(n):
    return np.arange(n) / SR


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * (1 - max(pan, 0))
    R[i : i + len(sig)] += sig * gain * (1 + min(pan, 0))


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(f, n, detune=0.0):
    ph = (np.cumsum(np.full(n, f * (1 + detune))) / SR) % 1.0
    return 2 * ph - 1


# ---- instruments -------------------------------------------------------------
def kick():
    n = int(0.45 * SR)
    t = t_(n)
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    click = hp(rng.standard_normal(n), 2000) * np.exp(-t * 300) * 0.3
    return np.tanh((body + click) * 1.6)


def clap():
    n = int(0.3 * SR)
    t = t_(n)
    env = np.exp(-t * 18)
    for d in (0.0, 0.011, 0.022):
        env += np.where(t >= d, np.exp(-(t - d) * 120), 0) * 0.6
    return bp(rng.standard_normal(n), 900, 5000) * env * 0.7


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = t_(n)
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * (14 if open_ else 70)) * 0.35


def bass(m, dur):
    n = int(dur * SR)
    t = t_(n)
    x = saw(note(m), n) * 0.6 + np.sin(2 * np.pi * note(m - 12) * t) * 0.8
    env = np.minimum(1, t * 200) * np.exp(-t * 2.2)
    return lp(x, 420) * env


def pad(ms, dur, cutoff):
    n = int(dur * SR)
    t = t_(n)
    x = sum(saw(note(m), n, d) for m in ms for d in (-0.004, 0.0, 0.005)) / (3 * len(ms))
    env = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4)
    return lp(x, cutoff, 2) * env


def pluck(m, dur=0.22):
    n = int(dur * SR)
    t = t_(n)
    x = saw(note(m), n) * 0.5 + saw(note(m), n, 0.006) * 0.5
    return lp(x, 2600) * np.exp(-t * 16)


def riser(dur):
    n = int(dur * SR)
    t = t_(n)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    seg = n // 24
    for k in range(24):
        lo = 300 + k * 300
        a, b = k * seg, min(n, (k + 1) * seg + seg // 2)
        out[a:b] += bp(x[a:b], lo, min(lo * 3, 20_000))
    return out * (t / dur) ** 2 * 0.5


def impact():
    n = int(2.5 * SR)
    t = t_(n)
    boom = np.sin(2 * np.pi * np.cumsum(40 + 60 * np.exp(-t * 6)) / SR) * np.exp(-t * 1.6)
    wash = lp(rng.standard_normal(n), 3000) * np.exp(-t * 2.5) * 0.25
    return np.tanh((boom + wash) * 1.4)


def crowd(dur, swell):
    n = int(dur * SR)
    t = t_(n)
    x = bp(rng.standard_normal(n), 300, 3500)
    x += bp(rng.standard_normal(n), 900, 2500) * (0.5 + 0.5 * np.sin(2 * np.pi * 7.3 * t)) * 0.4
    return x * swell(t) * 0.18


# ---- arrangement -------------------------------------------------------------
CHORDS = [  # (root for bass, pad voicing) Am F C G
    (45, [57, 60, 64, 69]),
    (41, [57, 60, 65, 69]),
    (48, [55, 60, 64, 67]),
    (43, [55, 59, 62, 67]),
]
ARP = [[69, 72, 76, 72], [69, 72, 77, 72], [67, 72, 76, 72], [67, 71, 74, 71]]


def level(t):
    """0 intro, 1 groove, 0.6 breath, 1.2 final, -1 outro."""
    if t < 12:
        return 0
    if t < 54:
        return 1
    if t < 66:
        return 0.6
    if t < 78:
        return 1
    if t < 86:
        return 1.2
    return -1


bars = int(LEN / BAR)
for b in range(bars):
    at = b * BAR
    root, voicing = CHORDS[b % 4]
    lv = level(at)
    cutoff = 500 + 300 * b if at < 12 else (1800 if lv != 0.6 else 1100)
    add(pad(voicing, BAR + 0.3, min(cutoff, 2400)), at, 0.32 if lv >= 0 else 0.22, 0)
    if lv == 0:
        # Intro: muted pulse on 8ths, getting brighter.
        for i in range(8):
            add(lp(pluck(voicing[i % 4] - 12), 500 + 150 * b), at + i * BEAT / 2, 0.25)
        continue
    if lv < 0:
        continue
    for beat in range(4):
        bt = at + beat * BEAT
        add(kick(), bt, 0.9)
        add(bass(root, BEAT / 2 - 0.02), bt + BEAT / 2, 0.55)
        add(hat(), bt + BEAT / 2, 0.5, 0.25)
        if lv >= 1:
            add(hat(), bt + BEAT / 4, 0.25, -0.25)
            add(hat(), bt + 3 * BEAT / 4, 0.25, -0.25)
        if beat in (1, 3):
            add(clap(), bt, 0.55)
    if lv >= 1:
        arp = ARP[b % 4]
        for i in range(16):
            add(pluck(arp[i % 4] + (12 if lv > 1 and i % 8 >= 4 else 0)), at + i * BEAT / 4, 0.16, 0.35 if i % 2 else -0.35)
    if lv > 1:
        add(hat(True), at + BEAT * 1.5, 0.3)
        add(hat(True), at + BEAT * 3.5, 0.3)

# Builds, drops and the crowd.
add(riser(4.0), 8.0, 0.8)
add(impact(), 12.0, 0.7)
add(riser(2.0), 32.0, 0.5)
add(riser(4.0), 50.0, 0.6)
add(riser(4.0), 74.0, 0.7)
add(impact(), 78.0, 0.6)
add(impact(), 86.0, 0.8)
add(crowd(12.5, lambda t: np.minimum(1, t / 2) * (0.6 + 0.4 * np.minimum(1, t / 10))), 0.0, 1.0)
add(crowd(12.0, lambda t: np.minimum(1, t / 1.5) * np.minimum(1, (12 - t) / 3)), 78.0, 1.1)

# Master: gentle glue, fade out, normalise.
mix = np.stack([L, R])
mix = np.tanh(mix * 0.9)
fade = np.ones(N)
fn = int(3.0 * SR)
fade[-fn:] = np.linspace(1, 0, fn) ** 1.5
mix *= fade
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype("<i2").tobytes())
print(f"wrote {OUT} ({LEN:.0f} s)")
