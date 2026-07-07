import 'dotenv/config';
import {GoogleGenerativeAI} from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const idea = process.argv.slice(2).join(' ');

if (!idea) {
  console.error('Please provide an idea, e.g: node generate-script.mjs "an app that helps students split hostel bills"');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY in your .env file.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const scriptModel = genAI.getGenerativeModel({model: 'gemini-2.5-flash'});

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
- Exactly 4 scenes, in this order: one "title" scene (the idea's name/hook), two "statement" scenes (problem, then solution), one "cta" scene (call to action).
- Keep text punchy and short — this is spoken-word-style pacing for an animated video, not a paragraph.
- durationInFrames must stay exactly as shown above (60, 90, 90, 90) — do not change these numbers.
- Output ONLY the JSON object, nothing else.`;

console.log('Writing script...');
const scriptResult = await scriptModel.generateContent(scriptPrompt);
const rawText = scriptResult.response.text();
const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (e) {
  console.error('Could not parse JSON from Gemini. Raw output was:');
  console.error(cleaned);
  process.exit(1);
}

const audioDir = './public/audio';
fs.mkdirSync(audioDir, {recursive: true});

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

  const body = {
    contents: [{parts: [{text: `${styleDirection} ${text}`}]}],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Sulafat'}},
      },
    },
  };
  // ...rest stays the same

  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TTS API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const base64Data = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Data) throw new Error('No audio data returned for: ' + text);

  const pcmBuffer = Buffer.from(base64Data, 'base64');
  writeWavFile(outFile, pcmBuffer);
}

console.log('Generating narration for each scene...');
for (let i = 0; i < parsed.scenes.length; i++) {
  const scene = parsed.scenes[i];
  const fileName = `scene-${i}.wav`;
  const outPath = path.join(audioDir, fileName);
  console.log(`  Scene ${i + 1}/${parsed.scenes.length}: "${scene.text.slice(0, 40)}..."`);
  await generateNarration(scene.text, outPath, scene.style);
  scene.audioFile = `audio/${fileName}`;
}

fs.writeFileSync('./src/scenes.json', JSON.stringify(parsed, null, 2));
console.log('✅ Scenes + narration written. scenes.json updated.');
console.log(JSON.stringify(parsed, null, 2));

async function generateSceneImage(text, style, outFile) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

  const stylePrompt = {
    title: `A simple, friendly flat-illustration mascot character representing this idea, minimal vector style, warm colors, transparent-feeling clean background, NO text or words anywhere in the image: "${text}"`,
    statement: `A simple flat-icon illustration representing this concept, minimal vector style, clean single-color background, NO text or words anywhere in the image: "${text}"`,
    cta: `A friendly flat-illustration mascot character in an inviting welcoming pose, minimal vector style, warm colors, NO text or words anywhere in the image, representing: "${text}"`,
  }[style] || `A simple flat-illustration representing: "${text}", NO text in image`;

  const body = {
    contents: [{parts: [{text: stylePrompt}]}],
    generationConfig: {responseModalities: ['IMAGE']},
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Image API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData);
  if (!imagePart) throw new Error('No image data returned for: ' + text);

  const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
  fs.writeFileSync(outFile, buffer);
}



const imageDir = './public/images';
fs.mkdirSync(imageDir, {recursive: true});

console.log('Generating narration and images for each scene...');
for (let i = 0; i < parsed.scenes.length; i++) {
  const scene = parsed.scenes[i];
  const fileName = `scene-${i}.wav`;
  const outPath = path.join(audioDir, fileName);
  console.log(`  Scene ${i + 1}/${parsed.scenes.length}: "${scene.text.slice(0, 40)}..."`);
  await generateNarration(scene.text, outPath, scene.style);
  scene.audioFile = `audio/${fileName}`;
  await sleep(21000); // wait ~21s to stay under the 3-requests-per-minute TTS limit
}