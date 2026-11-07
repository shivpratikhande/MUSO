#!/usr/bin/env node
/**
 * Narration for the explainer: one WAV per scene from Deepgram Aura-2.
 *   node video/tts.mjs [scene…]   (needs DEEPGRAM_API_KEY in the root .env; no args = every scene)
 * Writes video/out/vo/<scene>.wav and video/out/vo/durations.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const key = readFileSync(`${root}.env`, 'utf8').match(/^DEEPGRAM_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error('DEEPGRAM_API_KEY missing from .env');
const { voice, scenes } = JSON.parse(readFileSync(`${root}video/script.json`, 'utf8'));
const dir = `${root}video/out/vo`;
mkdirSync(dir, { recursive: true });

const only = process.argv.slice(2);
const durFile = `${dir}/durations.json`;
const durations = existsSync(durFile) ? JSON.parse(readFileSync(durFile, 'utf8')) : {};
for (const s of scenes.filter((x) => !only.length || only.includes(x.id))) {
  const res = await fetch(
    `https://api.deepgram.com/v1/speak?model=${voice}&encoding=linear16&sample_rate=48000&container=wav`,
    {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: s.say }),
    },
  );
  if (!res.ok) throw new Error(`${s.id}: Deepgram ${res.status} ${await res.text()}`);
  const file = `${dir}/${s.id}.wav`;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const sec = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
      .toString()
      .trim(),
  );
  durations[s.id] = sec;
  console.log(`${s.id.padEnd(8)} ${sec.toFixed(2)} s`);
}
writeFileSync(durFile, JSON.stringify(durations, null, 2));
