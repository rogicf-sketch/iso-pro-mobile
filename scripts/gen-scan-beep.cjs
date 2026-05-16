/**
 * Gera um bip curto (WAV PCM) para feedback de scan — evita binário opaco no repositório.
 */
const fs = require('fs');
const path = require('path');

const sampleRate = 22050;
const durationSec = 0.1;
const freq = 920;
const numSamples = Math.floor(sampleRate * durationSec);
const numChannels = 1;
const bitsPerSample = 16;
const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
const blockAlign = (numChannels * bitsPerSample) / 8;
const dataSize = numSamples * numChannels * 2;

const buf = Buffer.alloc(44 + dataSize);
let o = 0;

buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(numChannels, 22);
buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(byteRate, 28);
buf.writeUInt16LE(blockAlign, 32);
buf.writeUInt16LE(bitsPerSample, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);

o = 44;
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const env = Math.min(1, i / 160) * Math.min(1, (numSamples - i) / 320);
  const s = Math.sin(2 * Math.PI * freq * t) * 0.32 * env;
  const sample = Math.max(-32768, Math.min(32767, Math.floor(s * 32767)));
  buf.writeInt16LE(sample, o);
  o += 2;
}

const out = path.join(__dirname, '..', 'assets', 'sounds', 'scan-beep.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log('Wrote', out, buf.length, 'bytes');
