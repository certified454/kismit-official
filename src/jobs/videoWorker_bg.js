import path from 'path';
import fs from 'fs';
import VideoGeneration from '../modules/video.js';

// Replace this with your actual Lightning Cloudspace address found in your console logs
const LIGHTNING_URL = `https://8000-${process.env.LIGHTNING_CLOUDSPACE_HOST}.cloudspaces.litng.ai`;

export async function runJob(jobId, { uploadedPath, targetItem }) {
  const finalRenderPath = path.join(process.cwd(), 'temp', `${jobId}_output.mp4`);

  // Update Mongo status to processing
  await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing' });
  console.log(`📡 [Render Worker] Offloading job ${jobId} to Lightning GPU Studio...`);

  try {
    // 1. Pack the video file and text prompt into FormData
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(uploadedPath);
    const blob = new Blob([fileBuffer], { type: 'video/mp4' });
    formData.append('video', blob, path.basename(uploadedPath));
    formData.append('target_item', targetItem);

    // 2. Submit payload to Lightning Studio
    const submitResponse = await fetch(`${LIGHTNING_URL}/`, {
      method: 'POST',
      body: formData,
    });
    
    const submitData = await submitResponse.json();
    if (!submitData.success || !submitData.promptId) {
      throw new Error(submitData.error || 'Failed to initialize remote task');
    }

    const remoteJobId = submitData.promptId;
    console.log(`⏳ [Render Worker] Remote job registered: ${remoteJobId}. Polling for completion...`);

    // 3. Keep tracking the job until it's finished
    let isDone = false;
    let attempts = 0;
    
    while (!isDone && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5 seconds before checking
      attempts++;

      const statusCheck = await fetch(`${LIGHTNING_URL}/api/status/${remoteJobId}`);
      
      // Look at the content type. If it's returning JSON, it's still processing or failed
      const contentType = statusCheck.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const statusData = await statusCheck.json();
        if (statusData.status === 'processing') {
          console.log(`⏳ [Render Worker] Still baking on GPU (Attempt ${attempts}/60)...`);
          continue;
        }
        if (statusData.success === false || statusData.status === 'failed') {
          throw new Error(statusData.error || 'GPU worker failed processing');
        }
      } else {
        // If it returns video/mp4, the file stream is coming in hot!
        console.log(`📥 [Render Worker] Processing complete! Downloading raw video back to Render storage...`);
        const arrayBuffer = await statusCheck.arrayBuffer();
        fs.writeFileSync(finalRenderPath, Buffer.from(arrayBuffer));
        isDone = true;
      }
    }

    if (!isDone) throw new Error('Lightning studio processing sequence timed out.');

    // 4. Update MongoDB to completed and point to Render's stream route
    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'completed',
      videoUrl: `/banter/stream/${jobId}_output.mp4` // Points to Render router stream
    });
    console.log(`✅ [Render Worker] Job ${jobId} fully synced and available.`);

  } catch (err) {
    console.error(`❌ [Render Worker Error]:`, err.message);
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed' });
  } finally {
    // Delete local upload file on Render to free storage
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
  }
}