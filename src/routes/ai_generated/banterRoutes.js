import express from 'express';
import VideoGeneration from '../../modules/video.js';
import multer from 'multer';
import path from 'path';
import { runJob } from '../../jobs/videoWorker_bg.js';

const router = express.Router();

// Store uploads in temp/ — worker cleans up after itself
const upload = multer({ dest: path.join(process.cwd(), 'temp/') });

// POST /banter/video-video
// Accepts: video (required), prompt (optional), userId (optional)
// Does NOT accept targetModification or memeAssetPath from client —
// those are backend-only concerns handled inside the worker.
router.post('/video-video', upload.single('video'), async (req, res) => {
  const videoFile       = req.file;
  const additionalPrompt = req.body.prompt?.trim() || '';
  const userId          = req.body.userId || null;

  // itemsToRemove can stay as a backend default — never trust client input for this
  const itemsToRemove = 'disfigured, blurry, low quality, deformed anatomy, watermark, text';

  if (!videoFile) {
    return res.status(400).json({ error: 'Missing video file upload' });
  }

  try {
    const activeJob = await VideoGeneration.create({
      userId: userId ? String(userId) : null,
      prompt: additionalPrompt,
      status: 'pending',
    });

    const jobId = activeJob._id.toString();

    // Fire and forget — non-blocking background job
    process.nextTick(() => {
      runJob(jobId, {
        uploadedPath:    videoFile.path,
        additionalPrompt,
        itemsToRemove,
        // targetModification and memeAssetPath are intentionally
        // NOT passed — the worker handles them internally
      }).catch((err) =>
        console.error(`[JobWorker:${jobId}] Failed:`, err)
      );
    });

    return res.status(202).json({
      success: true,
      jobId,
      message: 'Job queued',
    });

  } catch (err) {
    console.error('Enqueue error', err);
    return res.status(500).json({ error: 'Failed to enqueue job' });
  }
});

// GET /banter/status/:id
// Frontend polls this until status === 'completed' or 'failed'
router.get('/status/:id', async (req, res) => {
  try {
    const job = await VideoGeneration
      .findById(req.params.id)
      .select('status videoUrl updatedAt createdAt');

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json({
      status:    job.status,
      videoUrl:  job.videoUrl,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });

  } catch (err) {
    console.error('Status lookup error', err);
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

export default router;