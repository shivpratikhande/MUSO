#!/usr/bin/env node
/**
 * Renders the explainer: scene.html frame by frame (headless Chromium) → H.264, then mixes the
 * narration (video/out/vo) over the music (video/out/music.wav) with ducking.
 *
 *   PW=<dir with playwright-core> node video/render.mjs                 full video → video/out/muso-explainer.mp4
 *   PW=… node video/render.mjs --stills 5,15,40                          PNG stills → video/out/stills/
 *   PW=… node video/render.mjs --from 30 --to 40                         partial preview (no audio)
 * Steps before: python3 video/voice.py (recorded narration; or node video/tts.mjs) · python video/music.py
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const here = new URL('.', import.meta.url).pathname;
const out = `${here}out`;
const require = createRequire(`${process.env.PW || here}/`);
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const FPS = Number(opt('--fps', 30));
const words = readFileSync(`${out}/vo/words.json`, 'utf8');
const tlFile = `${out}/vo/timeline.json`;
const timeline = existsSync(tlFile) ? JSON.parse(readFileSync(tlFile, 'utf8')) : null;
const DUR = timeline?.dur ?? 90;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(`window.WORDS = ${words}; window.TIMELINE = ${JSON.stringify(timeline)};`);
await page.goto(`file://${here}scene.html`);
await page.evaluate(() => window.ready);
await page.waitForTimeout(300);

const muxOnly = args.includes('--mux-only'); // reuse video-silent.mp4, redo the audio only
if (args.includes('--stills')) {
  mkdirSync(`${out}/stills`, { recursive: true });
  for (const t of opt('--stills').split(',').map(Number)) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: `${out}/stills/t${String(t).padStart(5, '0')}.png` });
    console.log(`still ${t}s`);
  }
  await browser.close();
  process.exit(0);
}

const from = Number(opt('--from', 0));
const to = Number(opt('--to', DUR));
const partial = from !== 0 || to !== DUR;
const silent = `${out}/${partial ? 'preview' : 'video-silent'}.mp4`;
const ff = muxOnly ? null : spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });

const frames = muxOnly ? 0 : Math.round((to - from) * FPS);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const t = from + i / FPS;
  await page.evaluate((x) => window.render(x), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 150 === 0) console.log(`frame ${i}/${frames} (${t.toFixed(1)} s) · ${((Date.now() - t0) / 1000).toFixed(0)} s elapsed`);
}
if (ff) {
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
}
await browser.close();
if (partial) { console.log(`preview → ${silent}`); process.exit(0); }

// ---- audio: narration at its cues, music ducked under it ----
const VO = timeline?.vo ?? { problem: 1.6, meet: 12.5, artists: 26.2, arc: 34.5, arkiv: 54.5, ens: 66.5, close: 78.5 };
const ids = Object.keys(VO);
const inputs = ids.flatMap((id) => ['-i', `${out}/vo/${id}.wav`]);
const delayed = ids.map((id, i) => `[${i + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(VO[id] * 1000)}:all=1[v${i}]`).join(';');
const filter = [
  delayed,
  `${ids.map((_, i) => `[v${i}]`).join('')}amix=inputs=${ids.length}:normalize=0,volume=1.7,apad=whole_dur=${DUR},asplit=2[vo][key]`,
  `[1:a]volume=0.55[mus]`,
  `[mus][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=450[duck]`,
  `[duck][vo]amix=inputs=2:normalize=0,alimiter=limit=0.95,loudnorm=I=-15:TP=-1.5:LRA=11[a]`,
].join(';');
const final = `${out}/muso-explainer.mp4`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', `${out}/music.wav`, ...inputs,
  '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', final], { stdio: 'inherit' });
console.log(`done → ${final}`);
