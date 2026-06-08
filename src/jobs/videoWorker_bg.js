import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';        // ✅ FIX 1 (Claude): ESM import, removes require() crash
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { InferenceClient } from '@huggingface/inference';
import VideoGeneration from '../modules/video.js';

ffmpeg.setFfmpegPath(ffmpegStatic);
const execAsync = promisify(exec);            // ✅ FIX 1 (Claude): replaces require('child_process').exec
const hf = new InferenceClient(process.env.HF_ACCESS_TOKEN);

// ─────────────────────────────────────────────────────────────
// CONFIG — tweak these without touching logic
// ─────────────────────────────────────────────────────────────
const EXTRACT_FPS        = 1;        // Lower = fewer frames = less drift between frames
const OUTPUT_WIDTH       = 1280;
const OUTPUT_HEIGHT      = 720;
const INFERENCE_STEPS    = 20;
const IMAGE_GUIDANCE     = 1.9;      // ✅ FIX (Claude): higher = face/body stays closer to original
const TEXT_GUIDANCE      = 7.5;
const SAMPLE_RATE        = 44100;

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Probes video duration and returns midpoint timestamp (seconds)
async function detectMidpointTimestamp(videoPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return resolve(1);
      const duration = metadata.format?.duration || 0;
      return resolve(Math.max(1, Math.floor(duration / 2)));
    });
  });
}

// ─────────────────────────────────────────────────────────────
// MAIN JOB RUNNER
// ─────────────────────────────────────────────────────────────
export async function runJob(jobId, opts = {}) {
  const {
    uploadedPath,
    targetModification,
    memeAssetPath,
    additionalPrompt,
    itemsToRemove,
  } = opts;

  const tempDir          = path.join(process.cwd(), 'temp', `job_${jobId}`);
  const framesDir        = path.join(tempDir, 'frames');
  const modifiedFramesDir = path.join(tempDir, 'modified_frames');

  ensureDir(tempDir);
  ensureDir(framesDir);
  ensureDir(modifiedFramesDir);

  try {
    // ── Mark job as processing ───────────────────────────────
    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'processing',
      updatedAt: new Date(),
    });

    // ── STEP 1: Extract frames from uploaded video ───────────
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

    // ── STEP 2: Run instruct-pix2pix on every frame ──────────
    console.log(`[Job:${jobId}] Running instruct-pix2pix on frames...`);
    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const outPath   = path.join(modifiedFramesDir, `mod_${frameFiles[i]}`);

      try {
        const buffer = fs.readFileSync(framePath);

        const resp = await hf.imageToImage({
          model: 'timbrooks/instruct-pix2pix',
          inputs: buffer,
          parameters: {
            prompt: `${additionalPrompt}. Realistically replace and add: ${targetModification}. Preserve the subject's face and body proportions exactly. Clean lighting blend with surroundings.`,
            negative_prompt: itemsToRemove,
            num_inference_steps: INFERENCE_STEPS,
            image_guidance_scale: IMAGE_GUIDANCE,   // stays close to original
            guidance_scale: TEXT_GUIDANCE,
          },
        });

        const arr = await resp.arrayBuffer();
        fs.writeFileSync(outPath, Buffer.from(arr));
        console.log(`[Job:${jobId}] ✓ Frame ${i + 1}/${frameFiles.length} modified`);

      } catch (innerErr) {
        // Fallback: if HF call fails for a single frame, keep the original
        console.error(
          `[Job:${jobId}] Frame ${frameFiles[i]} transform failed — using original:`,
          innerErr.message || innerErr
        );
        fs.copyFileSync(framePath, outPath);
      }
    }

    //STEP 3: Recompose modified frames → video clip
    const modifiedClip = path.join(tempDir, `modified_${jobId}.mp4`);
    console.log(`[Job:${jobId}] Recomposing modified frames into video...`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(modifiedFramesDir, 'mod_frame_%04d.jpg'))
        .inputOptions([`-framerate ${EXTRACT_FPS}`])
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          `-vf scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,  // normalize resolution
        ])
        .output(modifiedClip)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

   // Build final video via Complex Filter Graph (SAFE VERIFICATION EDITION) ───
    const finalPath = path.join(process.cwd(), 'temp', `final_${jobId}.mp4`);
    console.log(`[Job:${jobId}] Stitching final video with complex filter graph...`);

// Let's check if the uploaded file actually contains an audio track first
    const hasAudio = await new Promise((resolve) => {
      ffmpeg.ffprobe(uploadedPath, (err, metadata) => {
        if (err) return resolve(false);
        const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');
        resolve(!!audioStream);
      });
    });

    await new Promise((resolve, reject) => {
      const filterGraph = [
        // Normalize visual streams
        `[0:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v0]`,
        `[1:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v1]`,
        `[2:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v2]`,
        
        // Generate a silent audio stream for the AI clip (Input 1 has no audio)
        `anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}[silent_a1]`
      ];

      let concatString = '';
      if (hasAudio) {
        // If input 0 has audio, use it directly
        concatString = '[v0][0:a][v1][silent_a1][v2][2:a]concat=n=3:v=1:a=1[outv][outa]';
      } else {
        // If input 0 has NO audio, generate a second silent dummy track for it [silent_a0]
        filterGraph.push(`anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}[silent_a0]`);
        concatString = '[v0][silent_a0][v1][silent_a1][v2][2:a]concat=n=3:v=1:a=1[outv][outa]';
      }
      filterGraph.push(concatString);

      ffmpeg()
        .input(uploadedPath)    // Input [0]
        .input(modifiedClip)    // Input [1]
        .input(memeAssetPath)   // Input [2]
        .complexFilter(filterGraph)
        .outputOptions([
          '-map [outv]',
          '-map [outa]',
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-shortest'
        ])
        .output(finalPath)
        .on('end', resolve)
        .on('error', (err) => reject(new Error(`FFmpeg Complex Filter Failed: ${err.message}`)))
        .run();
    });

    console.log(`[Job:${jobId}] ✅ Final video ready: ${finalPath}`);

    // ── STEP 5: Persist result to DB ─────────────────────────
    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'completed',
      videoUrl: finalPath,
      updatedAt: new Date(),
    });

    // ── STEP 6: Cleanup temp workspace ───────────────────────
    try {
      fs.rmSync(framesDir, { recursive: true, force: true });
      fs.rmSync(modifiedFramesDir, { recursive: true, force: true });
      // Keep modifiedClip and originalCopy until you add cloud upload;
      // delete tempDir entirely once you move to cloud storage
    } catch (_) {}

    return finalPath;

  } catch (error) {
    console.error(`[Job:${jobId}] processing failed:`, error.message || error);

    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'failed',
      updatedAt: new Date(),
    });

    // Cleanup on failure too
    if (fs.existsSync(tempDir)) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }

    throw error;
  }
}

export default { runJob };