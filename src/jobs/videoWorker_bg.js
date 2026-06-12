import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
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
    // 1. Mark status as processing inside the database matrix
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing', updatedAt: new Date() });
    console.log(`[Job:${jobId}] Starting direct video tensor swap optimization...`);

    if (!LIGHTNING_URL) {
      throw new Error('LIGHTNING_URL environment variable is not configured in your .env profile');
    }

    if (!fs.existsSync(uploadedPath)) {
      throw new Error(`Target upload file sequence not found at path: ${uploadedPath}`);
    }

    // 2. Prepare Multipart Form Data Payload to pack the video file cleanly
    console.log(`[Job:${jobId}] Packaging raw video stream and metadata...`);
    const form = new FormData();
    form.append('video', fs.createReadStream(uploadedPath));
    form.append('prompt', additionalPrompt || 'A football player running wearing bright yellow leather timberland boots');

    // 3. Dispatch data straight over the web to your live Lightning Studio instance
    console.log(`[Job:${jobId}] Sending payload to Cloud GPU at: ${LIGHTNING_URL}/api/transform`);
    const response = await fetch(`${LIGHTNING_URL}/api/transform`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GPU Engine returned an operational error code ${response.status}: ${errText}`);
    }

    // 4. Capture the generated response vector
    const data = await response.json();
    if (!data.success || !data.image) {
      throw new Error(data.error || 'GPU server processing block returned an empty file payload');
    }

    // 5. Parse base64 frame data compilation and stream directly to local storage
    console.log(`[Job:${jobId}] Video tracking complete. Writing output stream to disk...`);
    const videoBuffer = Buffer.from(data.image, 'base64');
    fs.writeFileSync(finalPath, videoBuffer);

    // 6. Update Database Configuration to notify your frontend app
    await VideoGeneration.findByIdAndUpdate(jobId, { 
      status: 'completed', 
      videoUrl: `/temp/final_${jobId}.mp4`, 
      updatedAt: new Date() 
    });

    console.log(`🎉 [Job:${jobId}] Pipeline Execution Finished Flawlessly!`);
    return finalPath;

  } catch (error) {
    console.error(`❌ Fatal Error occurred inside process tracking pipeline for Job ${jobId}:`, error.message);
    
    // Fail gracefully inside your database log tracking
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed', updatedAt: new Date() });
    throw error;
  }
}

export default { runJob };