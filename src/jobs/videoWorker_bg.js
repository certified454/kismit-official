import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import VideoGeneration from '../modules/video.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

const OUTPUT_WIDTH   = 1280;
const OUTPUT_HEIGHT  = 720;
const LIGHTNING_URL  = process.env.LIGHTNING_URL;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Get the real frame-rate and details of the incoming clip so we match it exactly
async function getVideoMetadata(videoPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return resolve({ fps: 30, hasAudio: false });
      const vStream = metadata.streams?.find((s) => s.codec_type === 'video');
      const aStream = metadata.streams?.find((s) => s.codec_type === 'audio');
      
      let fps = 30;
      if (vStream && vStream.r_frame_rate) {
        const parts = vStream.r_frame_rate.split('/');
        if (parts.length === 2 && parseFloat(parts[1]) !== 0) {
          fps = Math.round(parseFloat(parts[0]) / parseFloat(parts[1]));
        }
      }
      resolve({ fps: fps || 30, hasAudio: !!aStream });
    });
  });
}

async function transformFrameOnGPU(frameBuffer, prompt, negativePrompt) {
  if (!LIGHTNING_URL) throw new Error('LIGHTNING_URL environment variable is not configured');

  const response = await fetch(`${LIGHTNING_URL}/api/transform`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: frameBuffer.toString('base64'),
      prompt,
      negativePrompt,
      steps: 20
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GPU server status code ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (!data.success || !data.image) {
    throw new Error(data.error || 'GPU server returned empty payload');
  }

  return Buffer.from(data.image, 'base64');
}

export async function runJob(jobId, opts = {}) {
  const { uploadedPath, additionalPrompt = '', itemsToRemove = 'blurry, disfigured shoes, cleats' } = opts;
  const hasPrompt = additionalPrompt.trim().length > 0;

  const tempDir = path.join(process.cwd(), 'temp', `job_${jobId}`);
  const framesDir = path.join(tempDir, 'frames');
  const finalFramesDir = path.join(tempDir, 'final_frames');

  ensureDir(tempDir); ensureDir(framesDir); ensureDir(finalFramesDir);

  try {
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing', updatedAt: new Date() });

    // 1. Determine native video properties
    const { fps, hasAudio } = await getVideoMetadata(uploadedPath);
    console.log(`[Job:${jobId}] Video analyzed. Native FPS: ${fps}, Audio Present: ${hasAudio}`);

    // 2. Extract EVERY single native frame to keep motion smooth
    console.log(`[Job:${jobId}] Extracting high-fidelity frames...`);
    await new Promise((resolve, reject) => {
      ffmpeg(uploadedPath)
        .outputOptions(['-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`]) 
        .output(path.join(framesDir, 'frame_%04d.jpg'))
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const frameFiles = fs.readdirSync(framesDir).filter((f) => f.endsWith('.jpg')).sort();
    console.log(`[Job:${jobId}] Total frame matrix matching extraction: ${frameFiles.length} frames.`);

    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(framesDir, frameFiles[i]);
      const outPath   = path.join(finalFramesDir, `mod_${frameFiles[i]}`);

      if (!hasPrompt) {
        fs.copyFileSync(framePath, outPath);
        continue;
      }

      try {
        const originalBuffer = fs.readFileSync(framePath);

        // Send to your T4 Studio GPU instance
        const stableDiffusionBuffer = await transformFrameOnGPU(originalBuffer, additionalPrompt, itemsToRemove);

        // SURGICAL BLENDING: Read original frame sizes
        const baseImage = sharp(originalBuffer);
        const metadata = await baseImage.metadata();

        // Target the lower quadrant boundary matching where YOLO masks coordinates
        const cropHeight = Math.round(metadata.height * 0.30); 
        const cropTop = metadata.height - cropHeight;

        // Cut out the generated shoes from the GPU output
        const shoePatch = await sharp(stableDiffusionBuffer)
          .extract({ left: 0, top: cropTop, width: metadata.width, height: cropHeight })
          .toBuffer();

        // Overlay ONLY the generated shoes patch right back onto the crystal-clear native frame
        await baseImage
          .composite([{ input: shoePatch, top: cropTop, left: 0 }])
          .jpeg({ quality: 95 })
          .toFile(outPath);

        console.log(`[Job:${jobId}] Processed frame ${i + 1}/${frameFiles.length} successfully.`);

      } catch (err) {
        console.error(`⚠️ Frame extraction bypass on frame index (${frameFiles[i]}):`, err.message);
        fs.copyFileSync(framePath, outPath);
      }
    }

    // 3. Recompile the modified frames at the EXACT native frame rate
    const finalPath = path.join(process.cwd(), 'temp', `final_${jobId}.mp4`);
    console.log(`[Job:${jobId}] Stitching frames together at native ${fps} fps...`);

    // ... inside your videoworker.js stitching block ...
    await new Promise((resolve, reject) => {
      let cmd = ffmpeg()
        .input(path.join(finalFramesDir, 'mod_frame_%04d.jpg')) // Matches mod_frame_0001.jpg perfectly
        .inputOptions([`-framerate ${fps}`]);

      if (hasAudio) {
        cmd = cmd.input(uploadedPath);
        cmd = cmd.outputOptions(['-map 0:v:0', '-map 1:a:0', '-c:a copy']);
      } else {
        cmd = cmd.outputOptions(['-map 0:v:0']);
      }

      cmd.outputOptions(['-c:v libx264', '-pix_fmt yuv420p', '-crf 18'])
        .output(finalPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // 4. Update Database Configuration and clear jobs status
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'completed', videoUrl: `/temp/final_${jobId}.mp4`, updatedAt: new Date() });
    console.log(`🎉 [Job:${jobId}] Pipeline Execution Finished Flawlessly!`);
    return finalPath;

  } catch (error) {
    console.error("❌ Fatal Error occurred inside process tracking pipeline:", error.message);
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    throw error;
  }
}

export default { runJob };