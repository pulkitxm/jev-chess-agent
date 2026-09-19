import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function startRetinaRecording(page, directory) {
  const framesDirectory = resolve(directory, 'frames');
  await mkdir(framesDirectory, { recursive: true });
  const frames = [];
  let stopped = false;
  let failure;
  const started = performance.now();
  const capture = async () => {
    const timestamp = (performance.now() - started) / 1000;
    const name = `${String(frames.length).padStart(6, '0')}.jpg`;
    await page.screenshot({ path: resolve(framesDirectory, name), type: 'jpeg', quality: 90, scale: 'device', timeout: 10000 });
    frames.push({ name, timestamp });
  };
  await capture();
  const loop = (async () => {
    try {
      while (!stopped) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!stopped) await capture();
      }
    } catch (error) { failure = error; }
  })();
  return async () => {
    stopped = true;
    await loop;
    if (failure) throw failure;
    const ended = (performance.now() - started) / 1000;
    const lines = ['ffconcat version 1.0'];
    frames.forEach((frame, index) => {
      lines.push(`file '${frame.name}'`, `duration ${(frames[index + 1]?.timestamp ?? ended) - frame.timestamp}`);
    });
    lines.push(`file '${frames.at(-1).name}'`);
    const manifest = resolve(framesDirectory, 'frames.ffconcat');
    await writeFile(manifest, lines.join('\n') + '\n');
    await exportRecording(manifest, resolve(directory, 'match-4k.mp4'));
    await rm(framesDirectory, { recursive: true });
    return { width: 3840, height: 2160, layoutWidth: 1920, layoutHeight: 1080, capturedFrames: frames.length, durationSeconds: ended };
  };
}

export async function exportRecording(input, output, startSeconds = 0) {
  if (!Number.isFinite(startSeconds) || startSeconds < 0) throw new Error('Invalid recording start');
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(startSeconds), '-i', input,
      '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
      '-movflags', '+faststart', output], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Video export failed (${code}): ${error}`)));
  });
}
