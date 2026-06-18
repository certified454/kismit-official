import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import VideoGeneration from '../modules/video.js';

export async function runJob(jobId, { uploadedPath, targetItem }) {
  const outputPath = path.join(process.cwd(), 'temp', `${jobId}_output.mp4`);
  const bootReferencePng = path.join(process.cwd(), 'data', 'assets', 'timberland_reference.png');

  // Update DB status to processing
  await VideoGeneration.findByIdAndUpdate(jobId, { status: 'processing' });

  console.log(`🚀 [JobWorker:${jobId}] Starting Python pure CV pipeline for item: ${targetItem}`);

  return new Promise((resolve, reject) => {
    // Call the Python script directly from your Node background thread
    const pythonProcess = spawn('python3', [
      path.join(process.cwd(), 'boot_replacer.py'),
      '--video', uploadedPath,
      '--boot', bootReferencePng,
      '--output', outputPath,
      '--target_prompt', targetItem // Pass the text prompt ("shoes", "cleats") directly to Python CV
    ]);

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Python:Stdout:${jobId}] ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python:Stderr:${jobId}] ${data.toString().trim()}`);
    });

    pythonProcess.on('close', async (code) => {
      // Clean up the initial uploaded temp file
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);

      if (code === 0 && fs.existsSync(outputPath)) {
        console.log(`✅ [JobWorker:${jobId}] Video composition complete.`);
        
        // Update database with completed status and the asset location
        await VideoGeneration.findByIdAndUpdate(jobId, {
          status: 'completed',
          videoUrl: `/temp/${jobId}_output.mp4` // Matches your stream endpoint location
        });
        resolve();
      } else {
        console.error(`❌ [JobWorker:${jobId}] Python execution exited with error code ${code}`);
        await VideoGeneration.findByIdAndUpdate(jobId, { status: 'failed' });
        reject(new Error(`Python process exited with code ${code}`));
      }
    });
  });
}