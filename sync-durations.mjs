import fs from 'fs';
import path from 'path';

const FPS = 30; // your video is 30fps based on the 330-frame/11s render — confirm in Root.tsx if unsure
const PADDING_FRAMES = 6; // ~0.2s breathing room after each line so speech doesn't get cut off

function getWavDurationSeconds(filePath) {
  const buffer = fs.readFileSync(filePath);
  const byteRate = buffer.readUInt32LE(28);
  const dataSize = buffer.readUInt32LE(40);
  return dataSize / byteRate;
}

const scenesPath = './src/scenes.json';
const data = JSON.parse(fs.readFileSync(scenesPath, 'utf-8'));

for (const scene of data.scenes) {
  if (!scene.audioFile) continue;
  const wavPath = path.join('./public', scene.audioFile);
  const durationSeconds = getWavDurationSeconds(wavPath);
  const frames = Math.ceil(durationSeconds * FPS) + PADDING_FRAMES;
  console.log(`${scene.audioFile}: ${durationSeconds.toFixed(2)}s -> ${frames} frames (was ${scene.durationInFrames})`);
  scene.durationInFrames = frames;
}

fs.writeFileSync(scenesPath, JSON.stringify(data, null, 2));
console.log('✅ scenes.json durations synced to actual voiceover length.');