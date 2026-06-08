import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { InferenceClient } from '@huggingface/inference';
import VideoGeneration from '../modules/video.js';

ffmpeg.setFfmpegPath(ffmpegStatic);
const hf = new InferenceClient(process.env.HF_ACCESS_TOKEN);

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const EXTRACT_FPS     = 1;
const OUTPUT_WIDTH    = 1280;
const OUTPUT_HEIGHT   = 720;
const INFERENCE_STEPS = 20;
const IMAGE_GUIDANCE  = 1.9;
const TEXT_GUIDANCE   = 7.5;
const SAMPLE_RATE     = 44100;

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function probeAudio(videoPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return resolve(false);
      const audioStream = metadata.streams?.find((s) => s.codec_type === 'audio');
      resolve(!!audioStream);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// FREE query extractor — zero API calls, zero cost
// Strips filler words and extracts the most meaningful 2-4
// words from whatever the user typed as their prompt.
// e.g. "make the goalkeeper do a funny celebration dance"
//   →  "goalkeeper funny celebration dance"
// ─────────────────────────────────────────────────────────────
function extractMemeSearchQuery(userPrompt) {
  // Words that carry no search value
  const STOP_WORDS = new Set([
    'a','an','the','and','or','but','in','on','at','to','for',
    'of','with','by','from','is','it','its','this','that','these',
    'those','make','makes','made','let','lets','have','has','do',
    'does','did','will','would','should','could','can','when','if',
    'then','so','my','your','his','her','their','our','me','him',
    'them','us','i','he','she','we','you','they','be','been','was',
    'were','are','am','get','gets','got','just','also','now','then',
    'into','onto','upon','after','before','while','during','add',
    'replace','swap','change','put','use','using','same','like',
    'video','clip','scene','show','shows','showing','player','person',
  ]);

  // Action/reaction words that are strong meme search signals
  const MEME_SIGNALS = [
    'dance','dancing','dances','celebration','celebrate','funny',
    'reaction','fail','win','goal','save','catch','jump','fall',
    'laugh','cry','run','chase','hit','kick','throw','spin','flip',
    'cap','hat','shoe','boot','glasses','mask','costume',
  ];

  const words = userPrompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')   // strip punctuation
    .split(/\s+/)
    .filter(Boolean);

  // Prioritise meme signal words first, then remaining meaningful words
  const signalWords  = words.filter((w) => MEME_SIGNALS.includes(w));
  const contextWords = words.filter(
    (w) => !STOP_WORDS.has(w) && !MEME_SIGNALS.includes(w)
  );

  // Combine: signals first, then context, take up to 4 words total
  const combined = [...new Set([...signalWords, ...contextWords])].slice(0, 4);

  const query = combined.length > 0 ? combined.join(' ') : 'funny reaction';
  console.log(`[MemeQuery] Prompt: "${userPrompt}" → Query: "${query}"`);
  return query;
}

// ─────────────────────────────────────────────────────────────
// Tenor GIF/video search — FREE, just needs TENOR_API_KEY
// Get yours free at:
// https://developers.google.com/tenor/guides/quickstart
// (Google account only, no credit card)
// Then add TENOR_API_KEY to your Render environment variables.
// ─────────────────────────────────────────────────────────────
async function fetchMemeClip(searchQuery, destPath) {
  const apiKey = process.env.TENOR_API_KEY;

  if (!apiKey) {
    console.warn('[MemeSearch] TENOR_API_KEY not set in env — skipping meme.');
    return null;
  }

  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://tenor.googleapis.com/v2/search?q=${encodedQuery}&key=${apiKey}&limit=8&media_filter=mp4`;

    const resp = await fetch(url);
    const data = await resp.json();
    const results = data?.results;

    if (!results || results.length === 0) {
      console.warn(`[MemeSearch] No Tenor results for: "${searchQuery}"`);
      return null;
    }

    // Pick randomly from top results so it varies each time
    const pick   = results[Math.floor(Math.random() * results.length)];
    const mp4Url = pick?.media_formats?.mp4?.url;

    if (!mp4Url) {
      console.warn('[MemeSearch] Tenor result had no mp4 URL');
      return null;
    }

    console.log(`[MemeSearch] Downloading: ${mp4Url}`);
    await downloadFile(mp4Url, destPath);
    return destPath;

  } catch (err) {
    console.error('[MemeSearch] Tenor fetch failed:', err.message);
    return null;
  }
}

// Follow redirects and download any URL to disk
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file     = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// HuggingFace image-to-image with model fallback chain
// ─────────────────────────────────────────────────────────────
const IMAGE_TO_IMAGE_MODELS = [
  'stabilityai/stable-diffusion-xl-refiner-1.0',
  'timbrooks/instruct-pix2pix',
  'lllyasviel/sd-controlnet-canny',
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runImageToImage(buffer, prompt, negativePrompt) {
  const MAX_RETRIES = 3;

  for (const model of IMAGE_TO_IMAGE_MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Add a small 1.5-second break BEFORE making the request 
        // This stops Hugging Face from flagging your loop as spam
        await wait(1500);

        const resp = await hf.imageToImage({
          model,
          inputs: buffer,
          parameters: {
            prompt,
            negative_prompt: negativePrompt,
            num_inference_steps: INFERENCE_STEPS,
            image_guidance_scale: IMAGE_GUIDANCE,
            guidance_scale: TEXT_GUIDANCE,
          },
        });
        
        const arr = await resp.arrayBuffer();
        return Buffer.from(arr);

      } catch (err) {
        console.warn(`[HF] ${model} attempt ${attempt} failed: ${err.message}.`);
        
        if (attempt < MAX_RETRIES) {
          console.log(`Free tier busy. Waiting 4 seconds before retrying this frame...`);
          await wait(4000); // Wait longer on failure to let the public queue clear
        }
      }
    }
  }
  throw new Error('All HuggingFace models unavailable after retries');
}
// ─────────────────────────────────────────────────────────────
// MAIN JOB RUNNER
// ─────────────────────────────────────────────────────────────
export async function runJob(jobId, opts = {}) {
  const {
    uploadedPath,
    additionalPrompt = '',
    itemsToRemove = 'disfigured, blurry, low quality, deformed anatomy, watermark, text',
  } = opts;

  const hasPrompt = additionalPrompt.trim().length > 0;

  const tempDir           = path.join(process.cwd(), 'temp', `job_${jobId}`);
  const framesDir         = path.join(tempDir, 'frames');
  const modifiedFramesDir = path.join(tempDir, 'modified_frames');

  ensureDir(tempDir);
  ensureDir(framesDir);
  ensureDir(modifiedFramesDir);

  try {
    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'processing',
      updatedAt: new Date(),
    });

    // ── STEP 1: Extract frames ────────────────────────────────
    console.log(`[Job:${jobId}] Extracting frames at ${EXTRACT_FPS}fps...`);
    await new Promise((resolve, reject) => {
      ffmpeg(uploadedPath)
        .outputOptions(['-vf', `fps=${EXTRACT_FPS}`])
        .output(path.join(framesDir, 'frame_%04d.jpg'))
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const frameFiles = fs
      .readdirSync(framesDir)
      .filter((f) => f.endsWith('.jpg'))
      .sort();

    console.log(`[Job:${jobId}] ${frameFiles.length} frames extracted.`);

    // ── STEP 2: Build the edit prompt ────────────────────────
    // With prompt    → apply user's described changes
    // Without prompt → clean re-render, preserve everything,
    //                  no additions (also avoids copyright issues)
    const editPrompt = hasPrompt
      ? `${additionalPrompt}. Preserve the subject's face and body proportions exactly. Clean lighting blend with surroundings.`
      : `Cleanly re-render this scene. Preserve all subjects, faces, expressions, motion, and composition exactly as they appear. Do not add, remove, or modify anything.`;

    const negPrompt = hasPrompt
      ? itemsToRemove
      : `${itemsToRemove}, extra objects, additions, modifications, changes`;

    // ── STEP 3: AI image-to-image on each frame ───────────────
    console.log(`[Job:${jobId}] Running image-to-image (hasPrompt=${hasPrompt})...`);
    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const outPath   = path.join(modifiedFramesDir, `mod_${frameFiles[i]}`);

      try {
        const buffer    = fs.readFileSync(framePath);
        const outBuffer = await runImageToImage(buffer, editPrompt, negPrompt);
        fs.writeFileSync(outPath, outBuffer);
        console.log(`[Job:${jobId}] ✓ Frame ${i + 1}/${frameFiles.length}`);
      } catch (innerErr) {
        console.error(`[Job:${jobId}] Frame ${frameFiles[i]} failed — keeping original:`, innerErr.message);
        fs.copyFileSync(framePath, outPath);
      }
    }

    // ── STEP 4: Recompose frames → silent modified clip ───────
    const modifiedClip = path.join(tempDir, `modified_${jobId}.mp4`);
    console.log(`[Job:${jobId}] Recomposing modified frames...`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(modifiedFramesDir, 'mod_frame_%04d.jpg'))
        .inputOptions([`-framerate ${EXTRACT_FPS}`])
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          `-vf scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
        ])
        .output(modifiedClip)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // ── STEP 5: Fetch meme from Tenor (only when prompt given) ─
    let memeClipPath = null;
    if (hasPrompt) {
      const memeQuery = extractMemeSearchQuery(additionalPrompt); // free, no API
      const memeDest  = path.join(tempDir, `meme_${jobId}.mp4`);
      memeClipPath    = await fetchMemeClip(memeQuery, memeDest); // Tenor free API
    }

    // ── STEP 6: Stitch final video ────────────────────────────
    const finalPath = path.join(process.cwd(), 'temp', `final_${jobId}.mp4`);
    const hasAudio  = await probeAudio(uploadedPath);

    console.log(`[Job:${jobId}] Stitching (meme=${!!memeClipPath}, audio=${hasAudio})...`);

    const useMeme = memeClipPath && fs.existsSync(memeClipPath);

    await new Promise((resolve, reject) => {
      const filterGraph = [
        `[0:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v0]`,
        `[1:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v1]`,
        // AI clip always has no audio — generate silence for it
        `anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}[silent_a1]`,
      ];

      let concatLine;

      if (useMeme) {
        // 3 segments: original + AI clip + meme
        filterGraph.push(`[2:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v2]`);
        if (hasAudio) {
          concatLine = '[v0][0:a][v1][silent_a1][v2][2:a]concat=n=3:v=1:a=1[outv][outa]';
        } else {
          filterGraph.push(`anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}[silent_a0]`);
          concatLine = '[v0][silent_a0][v1][silent_a1][v2][2:a]concat=n=3:v=1:a=1[outv][outa]';
        }
      } else {
        // 2 segments: original + AI clip (no meme found or no prompt)
        if (hasAudio) {
          concatLine = '[v0][0:a][v1][silent_a1]concat=n=2:v=1:a=1[outv][outa]';
        } else {
          filterGraph.push(`anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}[silent_a0]`);
          concatLine = '[v0][silent_a0][v1][silent_a1]concat=n=2:v=1:a=1[outv][outa]';
        }
      }

      filterGraph.push(concatLine);

      const cmd = ffmpeg()
        .input(uploadedPath)
        .input(modifiedClip);

      if (useMeme) cmd.input(memeClipPath);

      cmd
        .complexFilter(filterGraph)
        .outputOptions([
          '-map [outv]',
          '-map [outa]',
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-shortest',
        ])
        .output(finalPath)
        .on('end', resolve)
        .on('error', (err) =>
          reject(new Error(`FFmpeg stitch failed: ${err.message}`))
        )
        .run();
    });

    console.log(`[Job:${jobId}] ✅ Done: ${finalPath}`);

    // ── STEP 7: Save to DB ────────────────────────────────────
    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'completed',
      videoUrl: finalPath,
      updatedAt: new Date(),
    });

    // ── STEP 8: Cleanup ───────────────────────────────────────
    try {
      fs.rmSync(framesDir, { recursive: true, force: true });
      fs.rmSync(modifiedFramesDir, { recursive: true, force: true });
      if (memeClipPath && fs.existsSync(memeClipPath)) fs.unlinkSync(memeClipPath);
    } catch (_) {}

    return finalPath;

  } catch (error) {
    console.error(`[Job:${jobId}] processing failed:`, error.message || error);
    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'failed',
      updatedAt: new Date(),
    });
    if (fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
    throw error;
  }
}

export default { runJob };