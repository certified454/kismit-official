import express from 'express';
import VideoGeneration from '../../modules/video.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { runJob } from '../../jobs/videoWorker_bg.js';

const router = express.Router();
const upload = multer({ dest: path.join(process.cwd(), 'temp/') });

// POST /banter/video-video
router.post('/video-video', upload.single('video'), async (req, res) => {
  const videoFile = req.file;
  // Read target_item directly to follow the text keyword workflow modification
  const targetItem = req.body.target_item?.trim() || 'shoes'; 
  const userId = req.body.userId || null;

  if (!videoFile) {
    return res.status(400).json({ error: 'Missing video file upload' });
  }

  try {
    const activeJob = await VideoGeneration.create({
      userId: userId ? String(userId) : null,
      prompt: targetItem,
      status: 'pending',
    });

    const jobId = activeJob._id.toString();

    process.nextTick(() => {
      runJob(jobId, {
        uploadedPath: videoFile.path,
        targetItem: targetItem
      }).catch((err) =>
        console.error(`[JobWorker:${jobId}] Failed:`, err)
      );
    });

    return res.status(202).json({ success: true, jobId, message: 'Job queued successfully' });

  } catch (err) {
    console.error('Enqueue error', err);
    return res.status(500).json({ error: 'Failed to enqueue job' });
  }
});

// GET /banter/status/:id
router.get('/status/:id', async (req, res) => {
  try {
    const job = await VideoGeneration
      .findById(req.params.id)
      .select('status videoUrl updatedAt createdAt');

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let streamUrl = null;
    if (job.videoUrl && job.status === 'completed') {
      const filename = path.basename(job.videoUrl);
      streamUrl = `/banter/stream/${filename}`;
    }

    return res.json({
      status: job.status,
      videoUrl: streamUrl, 
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });

  } catch (err) {
    console.error('Status lookup error', err);
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

// GET /banter/stream/:filename
// Streams the final video file back to the client with robust seek configurations
router.get('/stream/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); 
  const filePath = path.join(process.cwd(), 'temp', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video asset not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const startPart = parts[0];
    const endPart = parts[1];

    const start = parseInt(startPart, 10);
    const end = endPart ? parseInt(endPart, 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`
      });
      return res.end();
    }

    const chunkSize = (end - start) + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });

    fileStream.on('error', (streamErr) => {
      console.error("[Stream Error] Error streaming file segment:", streamErr);
      if (!res.headersSent) res.status(500).end();
    });

    fileStream.pipe(res);

  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

export default router;