import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

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
