import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import { InferenceClient } from '@huggingface/inference';
import VideoGeneration from '../modules/video.js';
import { identifyPlayerFromPrompt } from '../lib/playermatcher.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

const EXTRACT_FPS    = 1;
const OUTPUT_WIDTH   = 1280;
const OUTPUT_HEIGHT  = 720;
const SAMPLE_RATE    = 44100;
const LIGHTNING_URL  = process.env.LIGHTNING_URL;

// Initialize serverless Hugging Face client for fast object detection bounding boxes
const hf = new InferenceClient(process.env.HF_ACCESS_TOKEN || '');

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

// Automatically isolates the player on screen using serverless object detection
async function detectPlayerBoundingBox(frameBuffer) {
  try {
    const response = await hf.objectDetection({
      model: 'facebook/detr-resnet-50',
      inputs: frameBuffer
    });

    const personMatches = response
      .filter(item => item.label === 'person' && item.score > 0.4)
      .sort((a, b) => b.score - a.score);

    if (personMatches.length === 0) return null;

    const { xmin, ymin, xmax, ymax } = personMatches[0].box;
    
    return {
      left: Math.max(0, xmin),
      top: Math.max(0, ymin),
      width: Math.min(OUTPUT_WIDTH - xmin, xmax - xmin),
      height: Math.min(OUTPUT_HEIGHT - ymin, ymax - ymin)
    };
  } catch (err) {
    console.warn('[Detection Warning] Failed serverless bounding box lookup:', err.message);
    return null;
  }
}

// Directly forwards frames to the Lightning GPU Instance
async function transformFrameOnGPU(frameBuffer, prompt, negativePrompt, faceUrl) {
  if (!LIGHTNING_URL) {
    throw new Error('LIGHTNING_URL not set in environment variables');
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

// Cleanly stitches original video with modified video sequential arrays
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
      // Clean link mapping: maps video segments sequentially, using input 0's native audio line
      filterGraph.push(`[v0][v1]concat=n=2:v=1:a=0[outv]`);
      cmd.complexFilter(filterGraph);
      cmd.outputOptions([
        '-map [outv]',
        '-map 0:a', // Directly pull unchanged clean audio tracking from source clip
        '-c:a aac',
        '-ar 44100'
      ]);
    } else {
      // Fallback if uploaded file has no audio footprint
      filterGraph.push(`[v0][v1]concat=n=2:v=1:a=0[outv]`);
      cmd.complexFilter(filterGraph);
      cmd.outputOptions(['-map [outv]']);
    }

    cmd.outputOptions([
         '-c:v libx264',
         '-pix_fmt yuv420p',
         '-shortest'
       ])
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
        let bufferToTransform = originalBuffer;
        let boundingBox = null;

        if (matchedPlayer) {
          boundingBox = await detectPlayerBoundingBox(originalBuffer);
        }

        if (boundingBox) {
          bufferToTransform = await sharp(originalBuffer)
            .extract({
              left: Math.round(boundingBox.left),
              top: Math.round(boundingBox.top),
              width: Math.round(boundingBox.width),
              height: Math.round(boundingBox.height)
            })
            .toBuffer();
          console.log(`[Job:${jobId}] Frame ${i}: Cropped target zone successfully.`);
        }

        let transformedCropBuffer = await transformFrameOnGPU(
          bufferToTransform, 
          additionalPrompt, 
          itemsToRemove, 
          matchedPlayer?.faceUrl
        );

        if (boundingBox) {
          const resizedCrop = await sharp(transformedCropBuffer)
            .resize(Math.round(boundingBox.width), Math.round(boundingBox.height))
            .toBuffer();

          bufferToTransform = await sharp(originalBuffer)
            .composite([{
              input: resizedCrop,
              top: Math.round(boundingBox.top),
              left: Math.round(boundingBox.left)
            }])
            .toBuffer();
            
          fs.writeFileSync(outPath, bufferToTransform);
        } else {
          fs.writeFileSync(outPath, transformedCropBuffer);
        }

      } catch (err) {
        console.error(`⚠️ Frame ${frameFiles[i]} substitution error:`, err.message);
        fs.copyFileSync(framePath, outPath);
      }
    }

    const modifiedClip = path.join(tempDir, `modified_${jobId}.mp4`);
    await new Promise((resolve, reject) => {
      ffmpeg().input(path.join(modifiedFramesDir, 'mod_frame_%04d.jpg')).inputOptions([`-framerate ${EXTRACT_FPS}`])
        .outputOptions(['-c:v libx264','-pix_fmt yuv420p',`-vf scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`])
        .output(modifiedClip).on('end', resolve).on('error', reject).run();
    });

    const finalPath = path.join(process.cwd(), 'temp', `final_${jobId}.mp4`);
    const hasAudio  = await probeAudio(uploadedPath);

    // Call updated simple stitch script
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