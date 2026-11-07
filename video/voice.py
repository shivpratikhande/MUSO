"""
Builds the narration from the recorded takes (video/voice/take*.m4a) using video/voice-edl.json:
cut → join with short fades → clean (noise reduction, warmth, compression) → one WAV per scene.
Then re-transcribes each scene for word timings and lays out the timeline so scenes follow the
speaker's pace (scene starts snap to the music's beat).

  python3 video/voice.py        (needs DEEPGRAM_API_KEY in the root .env for the word timings)
Writes video/out/vo/<scene>.wav, words.json and timeline.json (read by music.py, scene.html, render.mjs).
"""
import json
import math
import os
import re
import subprocess
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "vo")
ORDER = ["problem", "meet", "artists", "arc", "arkiv", "ens", "close"]
SNAP = 1.0  # scene cuts land on every other beat (120 BPM)
LEAD = 0.4  # voice starts this long after its scene cut
CLEAN = ",".join([
    "highpass=f=90",
    "afftdn=nr=14:nf=-42:tn=1",
    "agate=threshold=0.012:ratio=2:attack=5:release=150",
    "equalizer=f=180:t=q:w=1:g=2",
    "equalizer=f=3200:t=q:w=1.4:g=2.5",
    "equalizer=f=7500:t=q:w=2:g=-2",
    "acompressor=threshold=-22dB:ratio=3:attack=6:release=140:makeup=4",
    "loudnorm=I=-16:TP=-1.5:LRA=7",
])

key = re.search(r"^DEEPGRAM_API_KEY=(.+)$", open(os.path.join(HERE, "..", ".env")).read(), re.M).group(1).strip()
edl = json.load(open(os.path.join(HERE, "voice-edl.json")))["scenes"]
os.makedirs(OUT, exist_ok=True)


def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]))


words, durs = {}, {}
for scene in ORDER:
    parts = edl[scene]
    inputs, chains = [], []
    for i, (take, a, b) in enumerate(parts):
        inputs += ["-ss", f"{a}", "-to", f"{b}", "-i", os.path.join(HERE, "voice", f"{take}.m4a")]
        d = b - a
        chains.append(f"[{i}:a]aresample=48000,pan=mono|c0=0.5*c0+0.5*c1,afade=t=in:d=0.02,afade=t=out:st={d - 0.04:.3f}:d=0.04[p{i}]")
    joined = "".join(f"[p{i}]" for i in range(len(parts)))
    filt = ";".join(chains) + f";{joined}concat=n={len(parts)}:v=0:a=1,{CLEAN}[a]"
    wav = os.path.join(OUT, f"{scene}.wav")
    run(["ffmpeg", "-y", *inputs, "-filter_complex", filt, "-map", "[a]", "-ar", "48000", wav])
    durs[scene] = duration(wav)
    req = urllib.request.Request(
        "https://api.deepgram.com/v1/listen?model=nova-3&punctuate=true",
        data=open(wav, "rb").read(),
        headers={"Authorization": "Token " + key, "Content-Type": "audio/wav"},
    )
    w = json.load(urllib.request.urlopen(req))["results"]["channels"][0]["alternatives"][0]["words"]
    words[scene] = [[x["punctuated_word"], round(x["start"], 2), round(x["end"], 2)] for x in w]
    print(f"{scene:8} {durs[scene]:5.2f} s  {' '.join(x[0] for x in words[scene])}")

# Timeline: each scene starts on the beat after the previous line ends (+ a breath).
starts, vo, t = {}, {}, 0.0
for i, scene in enumerate(ORDER):
    starts[scene] = t
    vo[scene] = t + (1.6 if i == 0 else LEAD)
    t = math.ceil((vo[scene] + durs[scene] + 0.4) / SNAP) * SNAP
close_end = vo["close"] + durs["close"]
total = math.ceil((close_end + 3.5) / SNAP) * SNAP
starts["end"] = round(close_end, 2)
starts["done"] = total
timeline = {"scenes": starts, "vo": vo, "dur": total}
json.dump(words, open(os.path.join(OUT, "words.json"), "w"))
json.dump(timeline, open(os.path.join(OUT, "timeline.json"), "w"), indent=2)
json.dump(durs, open(os.path.join(OUT, "durations.json"), "w"), indent=2)
print(json.dumps(timeline, indent=2))
