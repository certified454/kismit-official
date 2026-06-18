import path from 'path';
import fs from 'fs';
import VideoGeneration from '../modules/video.js';

// Double-check your environment layout or hardcode it directly if testing:
const LIGHTNING_URL = `https://8000-${process.env.LIGHTNING_CLOUDSPACE_HOST}.cloudspaces.litng.ai`;

export async function runJob(jobId, { uploadedPath, targetItem }) {
  const finalRenderPath = path.join(process.cwd(), 'temp', `${jobId}_output.mp4`);

  await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing' });
  console.log(`📡 [Render Worker] Offloading job ${jobId} to Lightning GPU Studio: ${LIGHTNING_URL}`);

  try {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(uploadedPath);
    const blob = new Blob([fileBuffer], { type: 'video/mp4' });
    formData.append('video', blob, path.basename(uploadedPath));
    formData.append('target_item', targetItem);

    const submitResponse = await fetch(`${LIGHTNING_URL}/`, {
      method: 'POST',
      body: formData,
    });
    
    // ── SAFE PARSING LAYER ──
    const responseText = await submitResponse.text();
    let submitData;
    
    try {
      submitData = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(`❌ [Render Worker] Lightning did not return valid JSON. Received raw text instead:`);
      console.error(`----------------------------------------\n${responseText}\n----------------------------------------`);
      throw new Error("Lightning Studio returned an HTML/Text error wrapper instead of JSON API response.");
    }

    if (!submitData.success || !submitData.promptId) {
      throw new Error(submitData.error || 'Failed to initialize remote task');
    }

    const remoteJobId = submitData.promptId;
    console.log(`⏳ [Render Worker] Remote job registered: ${remoteJobId}. Polling...`);

    let isDone = false;
    let attempts = 0;
    
    while (!isDone && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const statusCheck = await fetch(`${LIGHTNING_URL}/api/status/${remoteJobId}`);
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
        console.log(`📥 [Render Worker] Processing complete! Downloading video...`);
        const arrayBuffer = await statusCheck.arrayBuffer();
        fs.writeFileSync(finalRenderPath, Buffer.from(arrayBuffer));
        isDone = true;
      }
    }

    if (!isDone) throw new Error('Lightning studio processing sequence timed out.');

    await VideoGeneration.findByIdAndUpdate(jobId, {
      status: 'completed',
      videoUrl: `/banter/stream/${jobId}_output.mp4`
    });
    console.log(`✅ [Render Worker] Job ${jobId} fully synced.`);

  } catch (err) {
    console.error(`❌ [Render Worker Error]:`, err.message);
    await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed' });
  } finally {
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
  }
}