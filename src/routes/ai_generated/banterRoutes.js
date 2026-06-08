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
  const videoFile        = req.file;
  const additionalPrompt = req.body.prompt?.trim() || '';
  const userId           = req.body.userId || null;
  const itemsToRemove    = 'disfigured, blurry, low quality, deformed anatomy, watermark, text';

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

    process.nextTick(() => {
      runJob(jobId, {
        uploadedPath: videoFile.path,
        additionalPrompt,
        itemsToRemove,
      }).catch((err) =>
        console.error(`[JobWorker:${jobId}] Failed:`, err)
      );
    });

    return res.status(202).json({ success: true, jobId, message: 'Job queued' });

  } catch (err) {
    console.error('Enqueue error', err);
    return res.status(500).json({ error: 'Failed to enqueue job' });
  }
});

// GET /banter/status/:id
// Returns status + a proper streamable URL (not a server file path)
router.get('/status/:id', async (req, res) => {
  try {
    const job = await VideoGeneration
      .findById(req.params.id)
      .select('status videoUrl updatedAt createdAt');

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // ✅ Convert the raw server file path into a streamable HTTP URL
    // e.g. /opt/render/project/src/temp/final_xxx.mp4
    //   →  https://yourapp.onrender.com/banter/stream/final_xxx.mp4
    let streamUrl = null;
    if (job.videoUrl && job.status === 'completed') {
      const filename = path.basename(job.videoUrl);
      streamUrl = `/banter/stream/${filename}`;
    }

    return res.json({
      status:    job.status,
      videoUrl:  streamUrl,        // relative URL — frontend appends API_URL
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });

  } catch (err) {
    console.error('Status lookup error', err);
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

// GET /banter/stream/:filename
// Streams the final video file back to the client
// Supports range requests so the video player can seek
router.get('/stream/:filename', (req, res) => {
  const filename  = path.basename(req.params.filename); // prevent path traversal
  const filePath  = path.join(process.cwd(), 'temp', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const stat     = fs.statSync(filePath);
  const fileSize = stat.size;
  const range    = req.headers.range;

  if (range) {
    // Handle range request — required for mobile video playback / seeking
    const parts   = range.replace(/bytes=/, '').split('-');
    const start   = parseInt(parts[0], 10);
    const end     = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   'video/mp4',
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);

  } else {
    // Full file — no range header
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type':   'video/mp4',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

export default router;