import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import VideoGeneration from '../modules/video.js';
import { identifyPlayerFromPrompt } from '../lib/playermatcher.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

const EXTRACT_FPS    = 1;
const OUTPUT_WIDTH   = 1280;
const OUTPUT_HEIGHT  = 720;
const LIGHTNING_URL  = process.env.LIGHTNING_URL;

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

// Directly hits your local inpainting container pipeline
async function transformFrameOnGPU(frameBuffer, prompt, negativePrompt) {
  if (!LIGHTNING_URL) {
    throw new Error('LIGHTNING_URL environment variable is not configured');
  }

  const response = await fetch(`${LIGHTNING_URL}/api/transform`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: frameBuffer.toString('base64'),
      prompt,
      negativePrompt
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GPU server generated status code ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (!data.success || !data.image) {
    throw new Error(data.error || 'GPU server returned empty image matrix payload');
  }

  return Buffer.from(data.image, 'base64');
}

function stitchVideos({ originalPath, modifiedPath, hasAudio, finalPath }) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    cmd.input(originalPath);
    cmd.input(modifiedPath);

    const filterGraph = [
      `[0:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v0]`,
      `[1:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setpts=PTS-STARTPTS[v1]`
    ];

    if (hasAudio) {
      filterGraph.push(`[v0][v1]concat=n=2:v=1:a=0[outv]`);
      cmd.complexFilter(filterGraph);
      cmd.outputOptions(['-map [outv]', '-map 0:a', '-c:a aac', '-ar 44100']);
    } else {
      filterGraph.push(`[v0][v1]concat=n=2:v=1:a=0[outv]`);
      cmd.complexFilter(filterGraph);
      cmd.outputOptions(['-map [outv]']);
    }

    cmd.outputOptions(['-c:v libx264', '-pix_fmt yuv420p', '-shortest'])
       .output(finalPath)
       .on('end', () => {
         console.log('✅ Final compilation succeeded seamlessly!');
         resolve();
       })
       .on('error', (err) => {
         console.error('❌ Stitch error generated:', err.message);
         reject(err);
       })
       .run();
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

    console.log(`[Job:${jobId}] Extracting frames from video source...`);
    await new Promise((resolve, reject) => {
      ffmpeg(uploadedPath)
        .outputOptions(['-vf', `fps=${EXTRACT_FPS}`])
        .output(path.join(framesDir, 'frame_%04d.jpg'))
        .on('end', resolve)
        .on('error', reject)
        .run();
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

        // Fetch the surgically inpainted buffer from the Lightning server
        const transformedBuffer = await transformFrameOnGPU(
          originalBuffer, 
          additionalPrompt, 
          itemsToRemove
        );

        fs.writeFileSync(outPath, transformedBuffer);
        console.log(`[Job:${jobId}] Frame ${i}: Surgically processed via Local Inpainting.`);

      } catch (err) {
        console.error(`⚠️ Frame ${frameFiles[i]} processing error:`, err.message);
        fs.copyFileSync(framePath, outPath);
      }
    }

    const modifiedClip = path.join(tempDir, `modified_${jobId}.mp4`);
    await new Promise((resolve, reject) => {
      ffmpeg().input(path.join(modifiedFramesDir, 'mod_frame_%04d.jpg')).inputOptions([`-framerate ${EXTRACT_FPS}`])
        .outputOptions(['-c:v libx264', '-pix_fmt yuv420p', `-vf scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`])
        .output(modifiedClip).on('end', resolve).on('error', reject).run();
    });

    const finalPath = path.join(process.cwd(), 'temp', `final_${jobId}.mp4`);
    const hasAudio  = await probeAudio(uploadedPath);

    await stitchVideos({ 
      originalPath: uploadedPath, 
      modifiedPath: modifiedClip, 
      hasAudio, 
      finalPath 
    });

    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'completed', videoUrl: finalPath, updatedAt: new Date() });
    return finalPath;

  } catch (error) {
    console.error("Fatal Worker Loop Error:", error.message);
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    throw error;
  }
}

export default { runJob };