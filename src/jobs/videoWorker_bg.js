import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import VideoGeneration from '../modules/video.js';
import { identifyPlayerFromPrompt } from '../lib/playermatcher.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

const EXTRACT_FPS    = 1;
const OUTPUT_WIDTH   = 1280;
const OUTPUT_HEIGHT  = 720;
const SAMPLE_RATE    = 44100;
const LIGHTNING_URL  = process.env.LIGHTNING_GPU_URL;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function probeAudio(videoPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return resolve(false);
      const stream = metadata.streams?.find((s) => s.codec_type === 'audio');
      resolve(!!stream);
    });
  });
}

// Directly forwards frames to the Lightning GPU Instance
async function transformFrameOnGPU(frameBuffer, prompt, negativePrompt, faceUrl) {
  if (!LIGHTNING_URL) {
    throw new Error('LIGHTNING_GPU_URL not set in environment variables');
  }

  const imageBase64 = frameBuffer.toString('base64');

  const response = await fetch(`${LIGHTNING_URL}/api/transform`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      prompt,
      negativePrompt: negativePrompt || 'blurry, low quality, disfigured',
      faceUrl: faceUrl || null
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GPU server error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (!data.success || !data.image) {
    throw new Error(data.error || 'GPU server returned no image');
  }

  return Buffer.from(data.image, 'base64');
}

function extractMemeQuery(promptText) {
  const STOP_WORDS = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','it','this','that','make','let','have','do','will','would','should','can','get','just','add','replace','swap','change','put','use','same','like','video','clip','scene','player','person','show']);
  const MEME_SIGNALS = ['dance','dancing','celebration','celebrate','funny','reaction','fail','win','goal','save','jump','fall','laugh','cry','run','kick','spin','flip'];
  const words = promptText.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(Boolean);
  const signals  = words.filter((w) => MEME_SIGNALS.includes(w));
  const context  = words.filter((w) => !STOP_WORDS.has(w) && !MEME_SIGNALS.includes(w));
  const combined = [...new Set([...signals, ...context])].slice(0, 4);
  return combined.length > 0 ? combined.join(' ') : 'funny reaction';
}

async function fetchMemeClip(searchQuery, destPath) {
  const apiKey = process.env.TENOR_API_KEY;
  if (!apiKey) return null;
  try {
    const url  = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchQuery)}&key=${apiKey}&limit=8&media_filter=mp4`;
    const resp = await fetch(url);
    const data = await resp.json();
    const mp4Url = data?.results?.[Math.floor(Math.random() * (data.results?.length || 1))]?.media_formats?.mp4?.url;
    if (!mp4Url) return null;
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const protocol = mp4Url.startsWith('https') ? https : http;
      protocol.get(mp4Url, (res) => {
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(destPath)));
      }).on('error', reject);
    });
  } catch { return null; }
}

function stitchVideos({ inputs, hasAudio, useMeme, finalPath }) {
  return new Promise((resolve, reject) => {
    const filterGraph = [
      `[0:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v0]`,
      `[1:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v1]`,
      `anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}[silent_a1]`,
    ];

    let concatLine;
    if (useMeme) {
      filterGraph.push(`[2:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v2]`);
      concatLine = hasAudio 
        ? '[v0][0:a][v1][silent_a1][v2][2:a]concat=n=3:v=1:a=1[outv][outa]'
        : '[v0],anullsrc=channel_layout=stereo:sample_rate=44100[silent_a0];[v0][silent_a0][v1][silent_a1][v2][2:a]concat=n=3:v=1:a=1[outv][outa]';
    } else {
      concatLine = hasAudio
        ? '[v0][0:a][v1][silent_a1]concat=n=2:v=1:a=1[outv][outa]'
        : '[v0],anullsrc=channel_layout=stereo:sample_rate=44100[silent_a0];[v0][silent_a0][v1][silent_a1]concat=n=2:v=1:a=1[outv][outa]';
    }
    filterGraph.push(concatLine);

    const cmd = ffmpeg();
    inputs.forEach((inp) => cmd.input(inp));
    cmd.complexFilter(filterGraph)
       .outputOptions(['-map [outv]','-map [outa]','-c:v libx264','-pix_fmt yuv420p','-shortest'])
       .output(finalPath).on('end', resolve).on('error', reject).run();
  });
}

export async function runJob(jobId, opts = {}) {
  const { uploadedPath, additionalPrompt = '', itemsToRemove = 'disfigured, blurry' } = opts;
  const hasPrompt = additionalPrompt.trim().length > 0;

  const tempDir = path.join(process.cwd(), 'temp', `job_${jobId}`);
  const framesDir = path.join(tempDir, 'frames');
  const modifiedFramesDir = path.join(tempDir, 'modified_frames');

  ensureDir(tempDir); ensureDir(framesDir); ensureDir(modifiedFramesDir);

  try {
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing', updatedAt: new Date() });

    let matchedPlayer = null;
    if (hasPrompt) {
      matchedPlayer = identifyPlayerFromPrompt(additionalPrompt);
    }

    console.log(`[Job:${jobId}] Extracting frames...`);
    await new Promise((resolve, reject) => {
      ffmpeg(uploadedPath).outputOptions(['-vf', `fps=${EXTRACT_FPS}`]).output(path.join(framesDir, 'frame_%04d.jpg')).on('end', resolve).on('error', reject).run();
    });

    const frameFiles = fs.readdirSync(framesDir).filter((f) => f.endsWith('.jpg')).sort();

    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const outPath   = path.join(modifiedFramesDir, `mod_${frameFiles[i]}`);

      if (!hasPrompt) {
        fs.copyFileSync(framePath, outPath);
        continue;
      }

      try {
        const originalBuffer = fs.readFileSync(framePath);
        // Ship the base64 and the matched face photo straight to the GPU instance!
        const outBuffer = await transformFrameOnGPU(originalBuffer, additionalPrompt, itemsToRemove, matchedPlayer?.faceUrl);
        fs.writeFileSync(outPath, outBuffer);
      } catch (err) {
        fs.copyFileSync(framePath, outPath);
      }
    }

    const modifiedClip = path.join(tempDir, `modified_${jobId}.mp4`);
    await new Promise((resolve, reject) => {
      ffmpeg().input(path.join(modifiedFramesDir, 'mod_frame_%04d.jpg')).inputOptions([`-framerate ${EXTRACT_FPS}`])
        .outputOptions(['-c:v libx264','-pix_fmt yuv420p',`-vf scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`])
        .output(modifiedClip).on('end', resolve).on('error', reject).run();
    });

    let memeClipPath = null;
    if (hasPrompt) {
      memeClipPath = await fetchMemeClip(extractMemeQuery(additionalPrompt), path.join(tempDir, `meme_${jobId}.mp4`));
    }

    const finalPath = path.join(process.cwd(), 'temp', `final_${jobId}.mp4`);
    const hasAudio  = await probeAudio(uploadedPath);
    const useMeme   = !!(memeClipPath && fs.existsSync(memeClipPath));

    const stitchInputs = [uploadedPath, modifiedClip];
    if (useMeme) stitchInputs.push(memeClipPath);

    await stitchVideos({ inputs: stitchInputs, hasAudio, useMeme, finalPath });

    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'completed', videoUrl: finalPath, updatedAt: new Date() });
    return finalPath;

  } catch (error) {
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    throw error;
  }
}

export default { runJob };