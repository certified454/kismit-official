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
  const { uploadedPath, additionalPrompt = '' } = opts;

  const tempDir = path.join(process.cwd(), 'temp');
  ensureDir(tempDir);
  const finalPath = path.join(tempDir, `final_${jobId}.mp4`);

  try {
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing', updatedAt: new Date() });
    console.log(`[Job:${jobId}] Launching pipeline...`);

    if (!LIGHTNING_URL) throw new Error('LIGHTNING_URL environment variable is missing');

    const form = new FormData();
    form.append('video', fs.createReadStream(uploadedPath));
    form.append('prompt', additionalPrompt);

    console.log(`[Job:${jobId}] Dispatching to Lightning GPU: ${LIGHTNING_URL}/`);

    const response = await axios.post(`${LIGHTNING_URL}/`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (!response.data.success || !response.data.promptId) {
      throw new Error(response.data.error || 'GPU rejected processing initialization');
    }

    const { promptId } = response.data;
    console.log(`🚀 GPU handshake verified. Tracking token: ${promptId}`);

    // Polling loop with transient error retry
    let complete = false;
    let base64Result = '';
    let transientRetries = 0;
    const MAX_TRANSIENT_RETRIES = 8; // allow up to 8 x 3s = 24s of ComfyUI instability
    const MAX_TOTAL_POLLS = 200;     // 200 x 3s = 10 min hard timeout
    let totalPolls = 0;

    while (!complete) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      totalPolls++;

      if (totalPolls > MAX_TOTAL_POLLS) {
        throw new Error(`Job ${jobId} timed out after 10 minutes of polling`);
      }

      let statusRes;
      try {
        statusRes = await axios.get(`${LIGHTNING_URL}/api/status/${promptId}`, {
          timeout: 15000 // 15s per poll request
        });
      } catch (pollErr) {
        // Network-level failure (connection refused, timeout, etc.)
        transientRetries++;
        console.warn(`⚠️ [Job:${jobId}] Poll network error (${transientRetries}/${MAX_TRANSIENT_RETRIES}): ${pollErr.message}`);
        if (transientRetries > MAX_TRANSIENT_RETRIES) {
          throw new Error(`Too many poll failures: ${pollErr.message}`);
        }
        continue; // retry the loop
      }

      const data = statusRes.data;

      if (data.status === 'completed' && data.image) {
        base64Result = data.image;
        complete = true;

      } else if (data.status === 'processing') {
        // Reset transient counter on clean processing responses
        transientRetries = 0;
        console.log(`⏳ [Job:${jobId}] GPU processing... (poll ${totalPolls})`);

      } else if (data.error) {
        // Distinguish transient fetch failures from real ComfyUI errors
        if (data.error.includes('fetch failed')) {
          transientRetries++;
          console.warn(`⚠️ [Job:${jobId}] ComfyUI transient fetch error (${transientRetries}/${MAX_TRANSIENT_RETRIES}): ${data.error}`);
          if (transientRetries > MAX_TRANSIENT_RETRIES) {
            throw new Error(`ComfyUI repeatedly failing: ${data.error}`);
          }
        } else {
          // Hard ComfyUI error — fail immediately
          throw new Error(data.error);
        }

      } else {
        // Unknown response shape — treat as transient
        transientRetries++;
        console.warn(`⚠️ [Job:${jobId}] Unexpected poll response (${transientRetries}/${MAX_TRANSIENT_RETRIES}):`, data);
        if (transientRetries > MAX_TRANSIENT_RETRIES) {
          throw new Error(`Unexpected response from GPU server: ${JSON.stringify(data)}`);
        }
      }
    }

    console.log(`[Job:${jobId}] Video received. Writing to disk...`);
    fs.writeFileSync(finalPath, Buffer.from(base64Result, 'base64'));

    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'completed',
      videoUrl: `/temp/final_${jobId}.mp4`,
      updatedAt: new Date()
    });

    console.log(`🎉 [Job:${jobId}] Pipeline complete!`);
    return finalPath;

  } catch (error) {
    const errorDetails = error.response?.data?.error || error.message;
    console.error(`❌ Fatal pipeline error for Job ${jobId}:`, errorDetails);

    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    throw error;
  }
}

export default { runJob };