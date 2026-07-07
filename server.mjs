import 'dotenv/config';
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';


let progress = { step: 'Idle', percent: 0 };
const execAsync = promisify(exec);
const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());
app.use(express.static('public-site'));
app.use('/rendered', express.static('out'));

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const scriptModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, label, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`${label} attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxAttempts) throw err;
      const waitTime = attempt * 15000;
      console.log(`Retrying ${label} in ${waitTime / 1000}s...`);
      await sleep(waitTime);
    }
  }
}

// ---------- Script generation ----------
async function generateScript(idea) {
  const scriptPrompt = `You are a pitch video scriptwriter. Turn the following idea into a short animated pitch video script.

Idea: "${idea}"

Return STRICT JSON only, no markdown, no preamble, matching exactly this shape:

{
  "scenes": [
    { "text": "string, max 90 characters", "style": "title", "durationInFrames": 60 },
    { "text": "string, max 140 characters", "style": "statement", "durationInFrames": 90 },
    { "text": "string, max 140 characters", "style": "statement", "durationInFrames": 90 },
    { "text": "string, max 90 characters", "style": "cta", "durationInFrames": 90 }
  ]
}

Rules:
- Exactly 4 scenes, in this order: one "title" scene, two "statement" scenes (problem, then solution), one "cta" scene.
- Keep text punchy and short.
- durationInFrames must stay exactly as shown above (60, 90, 90, 90).
- Output ONLY the JSON object, nothing else.`;

  const result = await scriptModel.generateContent(scriptPrompt);
  const rawText = result.response.text();
  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

// ---------- Voiceover generation ----------
function writeWavFile(filename, pcmData, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);
  fs.writeFileSync(filename, buffer);
}

async function generateNarration(text, outFile, style) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`;
  const styleDirection = {
    title: 'Say this like a warm, excited friend sharing a discovery — natural pacing, slight smile in the voice:',
    statement: 'Say this in a relaxed, conversational tone, like you\'re genuinely talking to a friend, not reading a script:',
    cta: 'Say this warmly and invitingly, like a friendly personal invitation, not a sales announcement:',
  }[style] || 'Say this naturally and warmly:';

  const voiceName = 'Sulafat';

  const body = {
    contents: [{ parts: [{ text: `${styleDirection} ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      console.warn("TTS API Quota Exceeded (429). Generating a silent fallback audio file...");
      const silenceDurationSec = 3; 
      const pcmBuffer = Buffer.alloc(24000 * 2 * silenceDurationSec, 0); // 3 seconds of silence
      writeWavFile(outFile, pcmBuffer);
      return;
    }
    throw new Error(`TTS API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const base64Data = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Data) throw new Error('No audio data returned for: ' + text);

  const pcmBuffer = Buffer.from(base64Data, 'base64');
  writeWavFile(outFile, pcmBuffer);
}

// ---------- Duration sync ----------
function getWavDurationSeconds(filePath) {
  const buffer = fs.readFileSync(filePath);
  const byteRate = buffer.readUInt32LE(28);
  const dataSize = buffer.readUInt32LE(40);
  return dataSize / byteRate;
}


app.get('/status', (req, res) => {
  res.json(progress);
});

// ---------- Main pipeline ----------
async function runPipeline(idea) {
  progress = { step: 'Writing script...', percent: 5 };
  const parsed = await retryWithBackoff(() => generateScript(idea), 'script generation');

  const audioDir = './public/audio';
  fs.mkdirSync(audioDir, { recursive: true });

  const FPS = 30;
  const PADDING_FRAMES = 6;
  const totalScenes = parsed.scenes.length;

  for (let i = 0; i < totalScenes; i++) {
    const scene = parsed.scenes[i];
    const basePercent = 10 + i * 20;

    progress = { step: `Recording voiceover: scene ${i + 1}/${totalScenes}`, percent: basePercent };
    const fileName = `scene-${i}.wav`;
    const outPath = path.join(audioDir, fileName);
    await retryWithBackoff(
      () => generateNarration(scene.text, outPath, scene.style),
      `narration scene ${i}`
    );
    scene.audioFile = `audio/${fileName}`;

    const durationSeconds = getWavDurationSeconds(outPath);
    scene.durationInFrames = Math.ceil(durationSeconds * FPS) + PADDING_FRAMES;

    progress = { step: `Finding visuals: scene ${i + 1}/${totalScenes}`, percent: basePercent + 10 };
    const imageDir = './public/images';
    fs.mkdirSync(imageDir, { recursive: true });
    const imageFileName = `scene-${i}.jpg`;
    const imageOutPath = path.join(imageDir, imageFileName);
    await retryWithBackoff(
      () => fetchSceneImage(scene.text, imageOutPath),
      `image scene ${i}`
    );
    scene.imageFile = `images/${imageFileName}`;

    await sleep(21000);
  }

  fs.writeFileSync('./src/scenes.json', JSON.stringify(parsed, null, 2));

  progress = { step: 'Rendering final video...', percent: 92 };
  await execAsync('npx remotion render MyComp out/pitch.mp4');

  await postToZapier('out/pitch.mp4');

  progress = { step: 'Done!', percent: 100 };
}

async function postToZapier(videoPath) {
  const webhookUrl = process.env.ZAPIER_WEBHOOK_URL || 'https://hooks.zapier.com/hooks/catch/28174034/4umuvbn/';
  if (!webhookUrl) {
    console.log('ZAPIER_WEBHOOK_URL not set, skipping Zapier upload.');
    return;
  }
  
  console.log('Posting video to Zapier...');
  progress = { step: 'Uploading to Instagram via Zapier...', percent: 95 };

  try {
    const fileBuffer = fs.readFileSync(videoPath);
    const blob = new Blob([fileBuffer], { type: 'video/mp4' });
    
    // 1. Upload to a temporary public host so Instagram can download it directly
    console.log('Uploading to temporary host to get a public URL...');
    const tmpFormData = new FormData();
    tmpFormData.append('file', blob, 'pitch.mp4');
    
    const tmpRes = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: tmpFormData,
    });
    
    if (!tmpRes.ok) {
      console.error('Failed to get public URL for video.');
      return;
    }
    
    const tmpJson = await tmpRes.json();
    // Convert to direct download link
    const publicUrl = tmpJson.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    console.log('Public video URL:', publicUrl);

    // 2. Send the public URL as JSON to Zapier
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: publicUrl }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Failed to post to Zapier:', errText);
    } else {
      console.log('Successfully posted to Zapier!');
    }
  } catch (err) {
    console.error('Error posting to Zapier:', err.message);
  }
}










// ---------- API endpoints ----------
app.post('/generate-script', async (req, res) => {
  const { idea } = req.body;
  if (!idea) return res.status(400).json({ error: 'No idea provided' });
  try {
    const parsed = await retryWithBackoff(() => generateScript(idea), 'script generation');
    res.json({ status: 'success', script: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function renderVideoFromScript(parsed, settings = {}) {
  parsed.settings = settings; // Save settings so Remotion can read them
  const audioDir = './public/audio';
  fs.mkdirSync(audioDir, { recursive: true });
  const FPS = 30;
  const PADDING_FRAMES = 6;
  const totalScenes = parsed.scenes.length;

  for (let i = 0; i < totalScenes; i++) {
    const scene = parsed.scenes[i];
    const basePercent = 10 + i * 20;

    progress = { step: `Recording voiceover: scene ${i + 1}/${totalScenes}`, percent: basePercent };
    const fileName = `scene-${i}.wav`;
    const outPath = path.join(audioDir, fileName);
    await retryWithBackoff(
      () => generateNarration(scene.text, outPath, scene.style),
      `narration scene ${i}`
    );
    scene.audioFile = `audio/${fileName}`;

    const durationSeconds = getWavDurationSeconds(outPath);
    scene.durationInFrames = Math.ceil(durationSeconds * FPS) + PADDING_FRAMES;

    progress = { step: `Finding visuals: scene ${i + 1}/${totalScenes}`, percent: basePercent + 10 };
    const imageDir = './public/images';
    fs.mkdirSync(imageDir, { recursive: true });
    const imageFileName = `scene-${i}.jpg`;
    const imageOutPath = path.join(imageDir, imageFileName);
    await retryWithBackoff(
      () => fetchSceneImage(scene.text, imageOutPath),
      `image scene ${i}`
    );
    scene.imageFile = `images/${imageFileName}`;

    await sleep(21000);
  }

  fs.writeFileSync('./src/scenes.json', JSON.stringify(parsed, null, 2));

  progress = { step: 'Rendering final video...', percent: 92 };
  await execAsync('npx remotion render MyComp out/pitch.mp4');

  await postToZapier('out/pitch.mp4');

  progress = { step: 'Done!', percent: 100 };
}

app.post('/render-video', async (req, res) => {
  const { script, format, style, voice, music, brandColor } = req.body;
  if (!script) return res.status(400).json({ error: 'No script provided' });

  try {
    await renderVideoFromScript(script, { format, style, voice, music, brandColor });
    res.json({ status: 'success', videoUrl: '/rendered/pitch.mp4?t=' + Date.now() });
  } catch (err) {
    console.error('Render failed:', err.message);
    progress = { step: 'Error occurred', percent: 0 };
    res.status(500).json({ error: err.message });
  }
});

app.post('/generate', async (req, res) => {
  const { idea } = req.body;
  if (!idea) return res.status(400).json({ error: 'No idea provided' });

  try {
    await runPipeline(idea);
    res.json({ status: 'success', videoUrl: '/rendered/pitch.mp4?t=' + Date.now() });
  } catch (err) {
    console.error('Pipeline failed:', err.message);
    progress = { step: 'Error occurred', percent: 0 };
    res.status(500).json({ error: err.message });
  }
});

app.listen(3050, () => console.log('Server running on http://localhost:3050'));


const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

async function fetchSceneImage(query, outPath) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pexels API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const photo = json.photos?.[0];
  if (!photo) throw new Error('No image found for query: ' + query);

  const imgRes = await fetch(photo.src.large);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
}