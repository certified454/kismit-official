import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import VideoGeneration from '../modules/video.js';
import { identifyPlayerFromPrompt } from './playerMatcher.js';
import { createCanvas, loadImage } from 'canvas';  // npm i canvas

ffmpeg.setFfmpegPath(ffmpegStatic);

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const EXTRACT_FPS    = 1;
const OUTPUT_WIDTH   = 1280;
const OUTPUT_HEIGHT  = 720;
const SAMPLE_RATE    = 44100;

// Your Lightning.ai public GPU server URL
// Set LIGHTNING_GPU_URL in Render environment variables
// e.g. https://your-studio-name.lightning.ai
const LIGHTNING_URL  = process.env.LIGHTNING_GPU_URL;

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
      const stream = metadata.streams?.find((s) => s.codec_type === 'audio');
      resolve(!!stream);
    });
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file     = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

// ─────────────────────────────────────────────────────────────
// FACE DETECTION — uses @vladmandic/face-api (CPU, no GPU needed)
// npm i @vladmandic/face-api canvas
// Models must be downloaded once — see setup comment below
// ─────────────────────────────────────────────────────────────

// Setup: run this once on your server to download face-api models:
// mkdir -p public/models && cd public/models
// wget https://github.com/vladmandic/face-api/raw/master/model/tiny_face_detector_model-weights_manifest.json
// wget https://github.com/vladmandic/face-api/raw/master/model/tiny_face_detector_model-shard1
// wget https://github.com/vladmandic/face-api/raw/master/model/face_landmark_68_model-weights_manifest.json
// wget https://github.com/vladmandic/face-api/raw/master/model/face_landmark_68_model-shard1
// wget https://github.com/vladmandic/face-api/raw/master/model/face_recognition_model-weights_manifest.json
// wget https://github.com/vladmandic/face-api/raw/master/model/face_recognition_model-shard1
// wget https://github.com/vladmandic/face-api/raw/master/model/face_recognition_model-shard2

let faceApiLoaded   = false;
let faceapi         = null;
let referenceDescriptor = null;   // Float32Array — the target player's face embedding

async function loadFaceApi() {
  if (faceApiLoaded) return;
  faceapi = await import('@vladmandic/face-api');
  const modelsPath = path.join(process.cwd(), 'public', 'models');
  await faceapi.nets.tinyFaceDetector.loadFromDisk(modelsPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
  faceApiLoaded = true;
  console.log('[FaceAPI] Models loaded.');
}

// Build a face descriptor from the player's photo URL
// Returns Float32Array or null
async function buildReferenceDescriptor(photoUrl) {
  if (!photoUrl) return null;
  try {
    const tmpPath = path.join(process.cwd(), 'temp', `ref_${Date.now()}.jpg`);
    await downloadFile(photoUrl, tmpPath);
    const img        = await loadImage(tmpPath);
    const canvas     = createCanvas(img.width, img.height);
    const ctx        = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    fs.unlinkSync(tmpPath);

    const detection = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      console.warn('[FaceAPI] No face found in reference photo.');
      return null;
    }
    console.log('[FaceAPI] Reference descriptor built successfully.');
    return detection.descriptor;
  } catch (err) {
    console.warn('[FaceAPI] Could not build reference descriptor:', err.message);
    return null;
  }
}

// Given a frame path, find bounding boxes of the target player's face
// Returns array of { x, y, width, height } or empty array
async function detectTargetFaceInFrame(framePath, referenceDescriptor) {
  try {
    const img    = await loadImage(framePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const detections = await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!detections || detections.length === 0) return [];

    const matches = [];
    for (const det of detections) {
      const distance = faceapi.euclideanDistance(referenceDescriptor, det.descriptor);
      // 0.5 threshold — lower = stricter match. 0.5 is standard for face recognition.
      if (distance < 0.5) {
        const box = det.detection.box;
        matches.push({
          x:      Math.max(0, Math.floor(box.x)),
          y:      Math.max(0, Math.floor(box.y)),
          width:  Math.ceil(box.width),
          height: Math.ceil(box.height),
        });
      }
    }
    return matches;

  } catch (err) {
    console.warn('[FaceAPI] Detection error on frame:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// LIGHTNING.AI GPU SERVER — transforms a single frame
// Sends base64 image, gets back base64 modified image
// ─────────────────────────────────────────────────────────────
async function transformFrameOnGPU(frameBuffer, prompt, negativePrompt) {
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

// ─────────────────────────────────────────────────────────────
// SELECTIVE FRAME EDIT
// If we know where the player's face is:
//   1. Crop a generous region around the player (face + body estimate)
//   2. Send ONLY that crop to the GPU for transformation
//   3. Paste the transformed crop back onto the original frame
// If no face detected in this frame: return original frame unchanged
// ─────────────────────────────────────────────────────────────
async function editPlayerInFrame(framePath, prompt, negativePrompt, referenceDescriptor) {
  const originalBuffer = fs.readFileSync(framePath);

  // If no reference descriptor (no player identified), edit the whole frame
  if (!referenceDescriptor) {
    console.log('  [Edit] No player reference — editing full frame');
    return await transformFrameOnGPU(originalBuffer, prompt, negativePrompt);
  }

  const boxes = await detectTargetFaceInFrame(framePath, referenceDescriptor);

  if (boxes.length === 0) {
    console.log('  [Edit] Target player not in this frame — keeping original');
    return originalBuffer;   // ← player not in frame, return untouched
  }

  console.log(`  [Edit] Player found at ${boxes.length} location(s) — editing selectively`);

  // Load original image to canvas for compositing
  const img        = await loadImage(framePath);
  const canvas     = createCanvas(img.width, img.height);
  const ctx        = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  for (const box of boxes) {
    // Expand the bounding box downward to include body (feet area for shoe swap etc.)
    // Face box height * 4 gives approximate head-to-feet region
    const expandedX = Math.max(0, box.x - box.width * 0.3);
    const expandedY = Math.max(0, box.y - box.height * 0.2);
    const expandedW = Math.min(img.width  - expandedX, box.width  * 1.6);
    const expandedH = Math.min(img.height - expandedY, box.height * 4.5);  // head to feet

    // Crop the player region
    const cropCanvas = createCanvas(expandedW, expandedH);
    const cropCtx    = cropCanvas.getContext('2d');
    cropCtx.drawImage(img, expandedX, expandedY, expandedW, expandedH, 0, 0, expandedW, expandedH);

    const cropBuffer = cropCanvas.toBuffer('image/jpeg', { quality: 0.92 });

    try {
      // Transform just this crop on the GPU
      const transformedBuffer = await transformFrameOnGPU(cropBuffer, prompt, negativePrompt);
      const transformedImg    = await loadImage(transformedBuffer);

      // Paste transformed crop back onto the full frame canvas
      ctx.drawImage(transformedImg, 0, 0, expandedW, expandedH, expandedX, expandedY, expandedW, expandedH);
      console.log(`  [Edit] ✓ Patch applied at (${Math.round(expandedX)}, ${Math.round(expandedY)})`);

    } catch (gpuErr) {
      console.warn(`  [Edit] GPU transform failed for patch — keeping original region:`, gpuErr.message);
      // Original region stays untouched on canvas
    }
  }

  return canvas.toBuffer('image/jpeg', { quality: 0.92 });
}

// ─────────────────────────────────────────────────────────────
// MEME SEARCH (free — Tenor API)
// ─────────────────────────────────────────────────────────────
function extractMemeQuery(promptText) {
  const STOP_WORDS = new Set([
    'a','an','the','and','or','but','in','on','at','to','for','of','with',
    'by','from','is','it','this','that','make','let','have','do','will',
    'would','should','can','get','just','add','replace','swap','change',
    'put','use','same','like','video','clip','scene','player','person','show',
  ]);
  const MEME_SIGNALS = [
    'dance','dancing','celebration','celebrate','funny','reaction','fail','win',
    'goal','save','jump','fall','laugh','cry','run','kick','spin','flip',
  ];
  const words = promptText.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(Boolean);
  const signals  = words.filter((w) => MEME_SIGNALS.includes(w));
  const context  = words.filter((w) => !STOP_WORDS.has(w) && !MEME_SIGNALS.includes(w));
  const combined = [...new Set([...signals, ...context])].slice(0, 4);
  const query    = combined.length > 0 ? combined.join(' ') : 'funny reaction';
  console.log(`[MemeQuery] "${promptText}" → "${query}"`);
  return query;
}

async function fetchMemeClip(searchQuery, destPath) {
  const apiKey = process.env.TENOR_API_KEY;
  if (!apiKey) { console.warn('[Tenor] TENOR_API_KEY not set — skipping meme.'); return null; }
  try {
    const url  = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchQuery)}&key=${apiKey}&limit=8&media_filter=mp4`;
    const resp = await fetch(url);
    const data = await resp.json();
    const pick = data?.results?.[Math.floor(Math.random() * (data.results?.length || 1))];
    const mp4Url = pick?.media_formats?.mp4?.url;
    if (!mp4Url) { console.warn('[Tenor] No mp4 URL in result'); return null; }
    await downloadFile(mp4Url, destPath);
    return destPath;
  } catch (err) { console.error('[Tenor] Failed:', err.message); return null; }
}

// ─────────────────────────────────────────────────────────────
// FFMPEG STITCH HELPER
// ─────────────────────────────────────────────────────────────
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
      if (hasAudio) {
        concatLine = '[v0][0:a][v1][silent_a1][v2][2:a]concat=n=3:v=1:a=1[outv][outa]';
      } else {
        filterGraph.push(`anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}[silent_a0]`);
        concatLine = '[v0][silent_a0][v1][silent_a1][v2][2:a]concat=n=3:v=1:a=1[outv][outa]';
      }
    } else {
      if (hasAudio) {
        concatLine = '[v0][0:a][v1][silent_a1]concat=n=2:v=1:a=1[outv][outa]';
      } else {
        filterGraph.push(`anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}[silent_a0]`);
        concatLine = '[v0][silent_a0][v1][silent_a1]concat=n=2:v=1:a=1[outv][outa]';
      }
    }
    filterGraph.push(concatLine);

    const cmd = ffmpeg();
    inputs.forEach((inp) => cmd.input(inp));
    cmd
      .complexFilter(filterGraph)
      .outputOptions(['-map [outv]','-map [outa]','-c:v libx264','-pix_fmt yuv420p','-shortest'])
      .output(finalPath)
      .on('end', resolve)
      .on('error', (err) => reject(new Error(`FFmpeg stitch failed: ${err.message}`)))
      .run();
  });
}

// ─────────────────────────────────────────────────────────────
// MAIN JOB RUNNER
// ─────────────────────────────────────────────────────────────
export async function runJob(jobId, opts = {}) {
  const {
    uploadedPath,
    additionalPrompt = '',
    itemsToRemove    = 'disfigured, blurry, low quality, deformed anatomy, watermark, text',
  } = opts;

  const hasPrompt = additionalPrompt.trim().length > 0;

  const tempDir           = path.join(process.cwd(), 'temp', `job_${jobId}`);
  const framesDir         = path.join(tempDir, 'frames');
  const modifiedFramesDir = path.join(tempDir, 'modified_frames');

  ensureDir(tempDir);
  ensureDir(framesDir);
  ensureDir(modifiedFramesDir);

  try {
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing', updatedAt: new Date() });

    // ── Load face-api models ──────────────────────────────────
    await loadFaceApi();

    // ── Identify player from prompt ───────────────────────────
    let matchedPlayer       = null;
    let referenceDescriptor = null;

    if (hasPrompt) {
      matchedPlayer = identifyPlayerFromPrompt(additionalPrompt);
      if (matchedPlayer) {
        console.log(`[Job:${jobId}] Player identified: ${matchedPlayer.officialName}`);
        referenceDescriptor = await buildReferenceDescriptor(matchedPlayer.faceUrl);
      } else {
        console.log(`[Job:${jobId}] No specific player in prompt — will edit full frames`);
      }
    }

    // ── STEP 1: Extract frames ────────────────────────────────
    console.log(`[Job:${jobId}] Extracting frames at ${EXTRACT_FPS}fps...`);
    await new Promise((resolve, reject) => {
      ffmpeg(uploadedPath)
        .outputOptions(['-vf', `fps=${EXTRACT_FPS}`])
        .output(path.join(framesDir, 'frame_%04d.jpg'))
        .on('end', resolve).on('error', reject).run();
    });

    const frameFiles = fs.readdirSync(framesDir).filter((f) => f.endsWith('.jpg')).sort();
    console.log(`[Job:${jobId}] ${frameFiles.length} frames extracted.`);

    // ── STEP 2: Build edit prompts ────────────────────────────
    const editPrompt = hasPrompt
      ? `${additionalPrompt}. Preserve the subject's face and body proportions exactly. Realistic lighting blend.`
      : `Cleanly re-render this scene. Preserve all subjects, faces, expressions, and composition exactly. Do not change anything.`;

    const negPrompt = hasPrompt
      ? itemsToRemove
      : `${itemsToRemove}, extra objects, modifications`;

    // ── STEP 3: Process each frame ────────────────────────────
    console.log(`[Job:${jobId}] Processing ${frameFiles.length} frames (playerMode=${!!referenceDescriptor})...`);

    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const outPath   = path.join(modifiedFramesDir, `mod_${frameFiles[i]}`);

      try {
        let outBuffer;

        if (!hasPrompt) {
          // No prompt — copy original frame, no GPU call needed
          fs.copyFileSync(framePath, outPath);
          console.log(`[Job:${jobId}] Frame ${i+1}/${frameFiles.length} — no prompt, kept original`);
          continue;
        }

        outBuffer = await editPlayerInFrame(framePath, editPrompt, negPrompt, referenceDescriptor);
        fs.writeFileSync(outPath, outBuffer);
        console.log(`[Job:${jobId}] ✓ Frame ${i+1}/${frameFiles.length} processed`);

      } catch (frameErr) {
        console.error(`[Job:${jobId}] Frame ${frameFiles[i]} failed — keeping original:`, frameErr.message);
        fs.copyFileSync(framePath, outPath);
      }
    }

    // ── STEP 4: Recompose frames → silent modified clip ───────
    const modifiedClip = path.join(tempDir, `modified_${jobId}.mp4`);
    console.log(`[Job:${jobId}] Recomposing frames into clip...`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(modifiedFramesDir, 'mod_frame_%04d.jpg'))
        .inputOptions([`-framerate ${EXTRACT_FPS}`])
        .outputOptions(['-c:v libx264','-pix_fmt yuv420p',`-vf scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`])
        .output(modifiedClip)
        .on('end', resolve).on('error', reject).run();
    });

    // ── STEP 5: Fetch meme clip if prompt given ───────────────
    let memeClipPath = null;
    if (hasPrompt) {
      const memeQuery = extractMemeQuery(additionalPrompt);
      const memeDest  = path.join(tempDir, `meme_${jobId}.mp4`);
      memeClipPath    = await fetchMemeClip(memeQuery, memeDest);
    }

    // ── STEP 6: Stitch final video ────────────────────────────
    const finalPath = path.join(process.cwd(), 'temp', `final_${jobId}.mp4`);
    const hasAudio  = await probeAudio(uploadedPath);
    const useMeme   = !!(memeClipPath && fs.existsSync(memeClipPath));

    console.log(`[Job:${jobId}] Stitching (meme=${useMeme}, audio=${hasAudio})...`);

    const stitchInputs = [uploadedPath, modifiedClip];
    if (useMeme) stitchInputs.push(memeClipPath);

    await stitchVideos({ inputs: stitchInputs, hasAudio, useMeme, finalPath });

    console.log(`[Job:${jobId}] ✅ Done: ${finalPath}`);

    // ── STEP 7: Save to DB ────────────────────────────────────
    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'completed', videoUrl: finalPath, updatedAt: new Date(),
    });

    // ── STEP 8: Cleanup ───────────────────────────────────────
    try {
      fs.rmSync(framesDir,         { recursive: true, force: true });
      fs.rmSync(modifiedFramesDir, { recursive: true, force: true });
      if (memeClipPath && fs.existsSync(memeClipPath)) fs.unlinkSync(memeClipPath);
    } catch (_) {}

    return finalPath;

  } catch (error) {
    console.error(`[Job:${jobId}] processing failed:`, error.message || error);
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    if (fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
    throw error;
  }
}

export default { runJob };