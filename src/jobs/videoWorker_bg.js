import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios'; // 👈 Swapped out native fetch for safe streaming
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
    console.log(`[Job:${jobId}] Launching streaming pipeline optimization...`);

    if (!LIGHTNING_URL) throw new Error('LIGHTNING_URL environment variable is missing');

    const form = new FormData();
    form.append('video', fs.createReadStream(uploadedPath));
    form.append('prompt', additionalPrompt);

    console.log(`[Job:${jobId}] Dispatching payload over Axios tunnel to: ${LIGHTNING_URL}/`);
    
    // Axios safely manages internal multipart headers and boundaries without throwing content mismatch crashes
    const response = await axios.post(`${LIGHTNING_URL}/swap`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (!response.data.success || !response.data.promptId) {
      throw new Error(response.data.error || 'Cloud GPU rejected processing initialization');
    }

    const { promptId } = response.data;
    console.log(`🚀 Handshake verified by GPU. Active tracking token: ${promptId}`);

    // Polling Loop executes safely inside Render background worker (ignores the 30-second gateway limit)
    let complete = false;
    let base64Result = '';

    while (!complete) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // poll every 3 seconds

      const statusRes = await axios.get(`${LIGHTNING_URL}/api/status/${promptId}`);
      if (statusRes.data.status === 'completed') {
        base64Result = statusRes.data.image;
        complete = true;
      } else if (statusRes.data.error) {
        throw new Error(statusRes.data.error);
      } else {
        console.log(`⏳ [Job:${jobId}] Cloud GPU is transforming frames...`);
      }
    }

    console.log(`[Job:${jobId}] Video compilation returned. Writing stream data to storage...`);
    fs.writeFileSync(finalPath, Buffer.from(base64Result, 'base64'));

    await VideoGeneration.findByIdAndUpdate(jobId, { 
      status: 'completed', 
      videoUrl: `/temp/final_${jobId}.mp4`, 
      updatedAt: new Date() 
    });

    console.log(`🎉 [Job:${jobId}] Pipeline Execution Finished Flawlessly!`);
    return finalPath;

  } catch (error) {
    const errorDetails = error.response?.data?.error || error.message;
    console.error(`❌ Fatal Error inside process tracking pipeline for Job ${jobId}:`, errorDetails);
    
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    throw error;
  }
}

export default { runJob };