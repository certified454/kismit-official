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
  const targetItem = req.body.target_item?.trim() || 'shoes'; 
  const userId = req.body.userId || null;

  if (!videoFile) {
    return res.status(400).json({ error: 'Missing video file upload target asset.' });
  }

  try {
    const activeJob = await VideoGeneration.create({
      userId: userId ? String(userId) : null,
      prompt: targetItem,
      status: 'pending',
    });

    const jobId = activeJob._id.toString();

    // Hand execution over to background worker immediately
    process.nextTick(() => {
      runJob(jobId, {
        uploadedPath: videoFile.path,
        targetItem: targetItem
      }).catch((err) =>
        console.error(`[JobWorker:${jobId}] Runtime processing failure triggered:`, err)
      );
    });

    return res.status(202).json({ success: true, jobId, message: 'Processing sequence initiated.' });

  } catch (err) {
    console.error('Enqueue error context failure:', err);
    return res.status(500).json({ error: 'System job creation scheduling failed.' });
  }
});

// GET /banter/status/:id
router.get('/status/:id', async (req, res) => {
  try {
    const job = await VideoGeneration
      .findById(req.params.id)
      .select('status videoUrl updatedAt createdAt');

    if (!job) {
      return res.status(404).json({ error: 'Target conversion request token invalid.' });
    }

    return res.json({
      status: job.status,
      videoUrl: job.status === 'completed' ? job.videoUrl : null, 
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });

  } catch (err) {
    console.error('Status validation context lookup error:', err);
    return res.status(500).json({ error: 'Failed to access structural process status records.' });
  }
});

// GET /banter/stream/:filename
router.get('/stream/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); 
  const filePath = path.join(process.cwd(), 'temp', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Requested video output asset could not be found.' });
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
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
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
      console.error("[Stream Layer Error] Exception writing out block segment chunks:", streamErr);
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