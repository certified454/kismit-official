import express from 'express';
import VideoGeneration from '../../modules/video.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { runJob } from '../../jobs/videoWorker_bg.js';

const router = express.Router();

// Configure local temporary file storage for incoming uploads
const upload = multer({ dest: path.join(process.cwd(), 'temp/') });

// Enqueue endpoint: accepts multipart/form-data and returns a job id
router.post('/video-video', upload.single('video'), async (req, res) => {
  const videoFile = req.file;
  const additionalPrompt = req.body.prompt || '';
  const userId = req.body.userId || null;
  const targetModification = req.body.targetModification || 'heavy yellow leather construction boots';
  const itemsToRemove = req.body.itemsToRemove || 'disfigured, blurry, low quality, deformed anatomy';
  const memeAssetPath = req.body.memeAssetPath || path.join(process.cwd(), 'assets', 'default_meme.mp4');

  if (!videoFile) {
    return res.status(400).json({ error: 'Missing video file upload' });
  }

  try {
    const activeJob = await VideoGeneration.create({ userId: userId ? String(userId) : null, prompt: additionalPrompt || '', status: 'pending' });
    const jobId = activeJob._id.toString();

    // schedule background job (non-blocking)
    process.nextTick(() => {
      runJob(jobId, {
        uploadedPath: videoFile.path,
        originalName: videoFile.originalname || videoFile.filename,
        targetModification,
        memeAssetPath,
        additionalPrompt,
        itemsToRemove
      }).catch((err) => console.error(`[JobWorker:${jobId}] Failed:`, err));
    });

    return res.status(202).json({ success: true, jobId, message: 'Job queued' });
  } catch (err) {
    console.error('Enqueue error', err);
    return res.status(500).json({ error: 'Failed to enqueue job' });
  }
});

// Status endpoint to let client poll job progress
router.get('/status/:id', async (req, res) => {
  try {
    const job = await VideoGeneration.findById(req.params.id).select('status videoUrl updatedAt createdAt');
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json({ status: job.status, videoUrl: job.videoUrl, createdAt: job.createdAt, updatedAt: job.updatedAt });
  } catch (err) {
    console.error('Status lookup error', err);
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

export default router;
