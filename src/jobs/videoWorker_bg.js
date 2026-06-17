import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import VideoGeneration from '../modules/video.js';

const LIGHTNING_URL = process.env.LIGHTNING_URL;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function runJob(jobId, opts = {}) {
  const { uploadedPath, targetItem = 'shoes' } = opts;

  const tempDir = path.join(process.cwd(), 'temp');
  ensureDir(tempDir);
  const finalPath = path.join(tempDir, `final_${jobId}.mp4`);

  try {
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing', updatedAt: new Date() });
    console.log(`[Job:${jobId}] Launching pipeline...`);

    if (!LIGHTNING_URL) throw new Error('LIGHTNING_URL environment variable is missing');

    const form = new FormData();
    form.append('video', fs.createReadStream(uploadedPath));
    // Pass target_item to drive the text-based object tracking on the Comfy instance
    form.append('target_item', targetItem);

    console.log(`[Job:${jobId}] Dispatching to Lightning Instance: ${LIGHTNING_URL}/`);

    const response = await axios.post(`${LIGHTNING_URL}/`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (!response.data.success || !response.data.promptId) {
      throw new Error(response.data.error || 'GPU rejected processing initialization');
    }

    const { promptId } = response.data;
    console.log(`🚀 Handshake verified. Tracking token: ${promptId}`);

    let complete = false;
    let transientRetries = 0;
    const MAX_TRANSIENT_RETRIES = 8; 
    const MAX_TOTAL_POLLS = 200;     
    let totalPolls = 0;

    while (!complete) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      totalPolls++;

      if (totalPolls > MAX_TOTAL_POLLS) {
        throw new Error(`Job ${jobId} timed out after polling threshold exceeded`);
      }

      let statusRes;
      try {
        statusRes = await axios.get(`${LIGHTNING_URL}/api/status/${promptId}`, {
          timeout: 15000,
          responseType: 'json'
        });
      } catch (pollErr) {
        transientRetries++;
        console.warn(`⚠️ [Job:${jobId}] Poll network error (${transientRetries}/${MAX_TRANSIENT_RETRIES}): ${pollErr.message}`);
        if (transientRetries > MAX_TRANSIENT_RETRIES) {
          throw new Error(`Too many poll failures: ${pollErr.message}`);
        }
        continue;
      }

      const data = statusRes.data;

      if (data.status === 'completed' && data.image) {
        console.log(`[Job:${jobId}] Video asset ready. Processing Base64 string directly to clean file...`);
        complete = true;

        // FIXED: The server delivers the completed video file wrapped as a base64 string 
        // inside data.image. We convert it to a binary buffer and write it out cleanly.
        const videoBuffer = Buffer.from(data.image, 'base64');
        fs.writeFileSync(finalPath, videoBuffer);
        
      } else if (data.status === 'processing') {
        transientRetries = 0;
        console.log(`⏳ [Job:${jobId}] Pipeline calculating frames... (poll ${totalPolls})`);
        
      } else if (data.error) {
        if (data.error.includes('fetch failed')) {
          transientRetries++;
          console.warn(`⚠️ [Job:${jobId}] ComfyUI transient fetch error (${transientRetries}/${MAX_TRANSIENT_RETRIES}): ${data.error}`);
          if (transientRetries > MAX_TRANSIENT_RETRIES) {
            throw new Error(`ComfyUI repeatedly failing: ${data.error}`);
          }
        } else {
          throw new Error(data.error);
        }
      } else {
        transientRetries++;
        console.warn(`⚠️ [Job:${jobId}] Unexpected response (${transientRetries}/${MAX_TRANSIENT_RETRIES})`);
        if (transientRetries > MAX_TRANSIENT_RETRIES) {
          throw new Error(`Unexpected endpoint response structure.`);
        }
      }
    }

    // FIXED: Clean up the old, empty string overwrite line that was breaking the file layout.
    // We safely assert existence checks on the verified path before database saves.
    if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size === 0) {
      throw new Error("Disk synchronization validation failed — Target MP4 is missing or empty.");
    }

    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'completed',
      videoUrl: `/temp/final_${jobId}.mp4`,
      updatedAt: new Date()
    });

    console.log(`🎉 [Job:${jobId}] Pipeline complete!`);
    
    // Clean up temporary initial user input video to keep cloud storage disk lean
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    
    return finalPath;

  } catch (error) {
    const errorDetails = error.response?.data?.error || error.message;
    console.error(`❌ Fatal pipeline error for Job ${jobId}:`, errorDetails);

    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    throw error;
  }
}

export default { runJob };