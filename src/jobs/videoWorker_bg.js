import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { InferenceClient } from '@huggingface/inference';
import VideoGeneration from '../modules/video.js';

ffmpeg.setFfmpegPath(ffmpegStatic);
const hf = new InferenceClient(process.env.HF_ACCESS_TOKEN);

// Helper: ensure directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Placeholder action detection: returns a timestamp to insert the meme/keeper-dance
// Real implementation should use an action-detection model or object-tracking to detect "skies the ball" event
async function detectSkyEventTimestamp(videoPath) {
  // Simple heuristic placeholder: return midpoint of video duration
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return resolve(null);
      const duration = metadata.format.duration || 0;
      return resolve(Math.max(0, Math.floor(duration / 2))); // seconds
    });
  });
}

export async function runJob(jobId, opts = {}) {
  const { uploadedPath, originalName, targetModification, memeAssetPath, additionalPrompt, itemsToRemove } = opts;
  const tempDir = path.join(process.cwd(), 'temp', `job_${jobId}`);
  ensureDir(tempDir);

  try {
    // mark processing
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing', updatedAt: new Date() });

    // 1) extract frames (multi-frame) at low fps for processing
    const framesDir = path.join(tempDir, 'frames');
    const modifiedFramesDir = path.join(tempDir, 'modified_frames');
    ensureDir(framesDir);
    ensureDir(modifiedFramesDir);

    // extract at 2 fps (adjust as needed)
    await new Promise((resolve, reject) => {
      ffmpeg(uploadedPath)
        .outputOptions(['-vf', 'fps=2'])
        .output(path.join(framesDir, 'frame_%04d.jpg'))
        .on('end', resolve)
        .on('error', (e) => reject(e))
        .run();
    });

    // 2) run image-to-image on each frame (temporal placeholder)
    const frameFiles = fs.readdirSync(framesDir).filter((f) => f.endsWith('.jpg')).sort();

    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const outPath = path.join(modifiedFramesDir, `mod_${frameFiles[i]}`);

      try {
        const buffer = fs.readFileSync(framePath);
        const resp = await hf.imageToImage({
          model: 'black-forest-labs/FLUX.1-schnell',
          inputs: buffer,
          parameters: {
            prompt: `Surgically modify the subject. Alter the targeted area and realistically add/replace it with: ${targetModification}. Ensure clean blending with the original image lighting. ${additionalPrompt}`,
            negative_prompt: itemsToRemove
          }
        });

        // write binary response (model may return arrayBuffer-like)
        const arr = await resp.arrayBuffer();
        fs.writeFileSync(outPath, Buffer.from(arr));
      } catch (innerErr) {
        console.error(`[Job:${jobId}] frame ${frameFiles[i]} transform failed:`, innerErr.message || innerErr);
        // fallback: copy original frame
        fs.copyFileSync(framePath, outPath);
      }
    }

    // 3) recompose modified frames into a video
    const modifiedClip = path.join(tempDir, `modified_${jobId}.mp4`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(modifiedFramesDir, 'mod_frame_%04d.jpg'))
        .inputOptions(['-framerate 2'])
        .outputOptions(['-c:v libx264', '-pix_fmt yuv420p'])
        .output(modifiedClip)
        .on('end', resolve)
        .on('error', (e) => reject(e))
        .run();
    });

    // 4) detect insertion timestamp (placeholder)
    const insertTs = await detectSkyEventTimestamp(uploadedPath) || 1;

    // 5) produce final by concatenating: original before insert, modified clip, meme asset, remainder
    // For simplicity, append modified clip + meme to the end of original (safer concat path)
    const concatList = path.join(tempDir, 'concat.txt');
    const finalPath = path.join(process.cwd(), 'temp', `final_${jobId}.mp4`);

    // Use the modified clip then meme asset appended to the original. Simpler: concat original + modified + meme
    // Create intermediate copies to ensure same codecs
    const originalCopy = path.join(tempDir, `orig_${jobId}.mp4`);
    await new Promise((resolve, reject) => {
      ffmpeg(uploadedPath)
        .outputOptions(['-c', 'copy'])
        .output(originalCopy)
        .on('end', resolve)
        .on('error', (e) => reject(e))
        .run();
    });

    fs.writeFileSync(concatList, `file '${originalCopy.replace(/'/g, "'\\''")}'\nfile '${modifiedClip.replace(/'/g, "'\\''")}'\nfile '${memeAssetPath.replace(/'/g, "'\\''")}'\n`);

    // run ffmpeg concat using spawn to avoid fluent quirks
    await new Promise((resolve, reject) => {
      const cmd = `ffmpeg -f concat -safe 0 -i "${concatList}" -c copy "${finalPath}"`;
      require('child_process').exec(cmd, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // 6) update DB with local path (replace with cloud upload in production)
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'completed', videoUrl: finalPath, updatedAt: new Date() });

    // cleanup: keep final file, remove temp frames
    try {
      fs.rmSync(framesDir, { recursive: true, force: true });
      fs.rmSync(modifiedFramesDir, { recursive: true, force: true });
    } catch (e) {}

    return finalPath;
  } catch (error) {
    console.error(`[Job:${jobId}] processing failed:`, error.message || error);
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    throw error;
  }
}

export default { runJob };
