import express from 'express';
import { InferenceClient }  from "@huggingface/inference";
import VideoGeneration from '../../modules/video.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';

const router = express.Router();
ffmpeg.setFfmpegPath(ffmpegStatic);
const hf = new InferenceClient(process.env.HF_ACCESS_TOKEN);

router.post('/video-video', async (req, res) => {
    const { userUploadedVideoUrl, additionalPrompt, userId, memeAssetPath, targetModification, itemsToRemove } = req.body;

    if (!userUploadedVideoUrl || !memeAssetPath) {
        console.error('Missing required parameters', { userUploadedVideoUrl, memeAssetPath });
        return res.status(400).json({ error: 'Missing required parameters: userUploadedVideoUrl and memeAssetPath' });
    };
   
    let currentJobId = null;

    /*Local workspace setup for Render's disk space*/
    const tempDir = path.join(process.cwd(), 'temp');
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const uniqueTimestamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const stichedVideoPath = path.join(tempDir, `stitched_${uniqueTimestamp}.mp4`);
    const extractedFramePath = path.join(tempDir, `extracted_frame_${uniqueTimestamp}.jpg`);
    const modifiedFramePath = path.join(tempDir, `modified_frame_${uniqueTimestamp}.jpg`);

    try {
        /*CREATE THE DATABASE RECORD (Matches your exact Mongoose Schema fields)*/
        const activeJob = await VideoGeneration.create({
            userId: userId || null,
            prompt: additionalPrompt || '',
            status: 'pending'
        });
        currentJobId = activeJob._id.toString();
        console.log(`[KSM Pipeline] Initialized Job ${currentJobId} in MongoDB`);

        /*RUN THE FFmpeg TIMELINE PASS*/
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(userUploadedVideoUrl)
                .input(memeAssetPath)
                .concat(stichedVideoPath)
                .on('end', resolve)
                .on('error', (err) => reject(new Error(`FFmpeg Stitching Error: ${err.message}`)))
                .run();
        })

        /*EXTRACT THE STARTING KEYFRAME*/
        await new Promise((resolve, reject) => {
            ffmpeg(stichedVideoPath)
                .screenshots({
                    timestamps: ['00:00:01'],
                    filename: path.basename(extractedFramePath),
                    folder: path.dirname(extractedFramePath)
                })
                .on('end', resolve)
                .on('error', (err) => reject(new Error(`FFmpeg Frame Extraction Error: ${err.message}`)));
        })

        /*CALL THE HF INFERENCE API FOR IMAGE-TO-IMAGE TRANSFORMATION*/
        const imageBuffer = fs.readFileSync(extractedFramePath);
        const inferenceResponse = await hf.imageToImage({
            model: 'black-forest-labs/FLUX.1-schnell',
            inputs: imageBuffer,
            parameters: {
                prompt: `Surgically modify the subject. Alter the targeted area and realistically add/replace it with: ${targetModification}. Ensure clean blending with the original image lighting.`,
                negative_prompt: itemsToRemove || "disfigured, blurry, low quality, deformed anatomy"
            }
        });
        fs.writeFileSync(modifiedFramePath, Buffer.from(await inferenceResponse.arrayBuffer()));

        /*RENDER THE TEMPORAL VIDEO OVERLAY VIA WAN2.1*/
        const modifiedVideoResponse= await hf.imageToVideo({
            model: 'Wan-AI/Wan2.1-I2V-14B-720P',
            inputs: {
                image: fs.readFileSync(modifiedFramePath),
                video_context: fs.readFileSync(stichedVideoPath),
                prompt: `Cinematic 4k broadcast rendering. The main player executes actions moving completely inside heavy yellow leather construction boots. The clip smoothly transitions to the asset celebrating on a grand football stadium pitch. ${additionalPrompt || ''}`
            }
        })

        const finalVideoUrl = modifiedVideoResponse.url || modifiedVideoResponse;
        /*UPDATE THE DATABASE RECORD ON COMPLETION (Matches your exact Schema fields)*/
        await VideoGeneration.findByIdAndUpdate(currentJobId, {
            status: 'completed',
            videoUrl: finalVideoUrl
        });

        /*WIPE THE TEMPORARY FILES FROM RENDER'S STORAGE*/
        if (fs.existsSync(stichedVideoPath)) fs.unlinkSync(stichedVideoPath);
        if (fs.existsSync(modifiedFramePath)) fs.unlinkSync(modifiedFramePath);
        if (fs.existsSync(extractedFramePath)) fs.unlinkSync(extractedFramePath);
        console.log(`[KSM Pipeline] Completed Job ${currentJobId} - Video URL: ${finalVideoUrl}`);
        return res.status(200).json({
            success: true,
            message: 'Video processing completed successfully',
            videoUrl: finalVideoUrl
        })
    } catch (error) {
        console.error(`[Fatal Error] Job ${currentJobId} failed:`, error.message);

        /*Update database status to 'failed' if things crash mid-way*/
        if (currentJobId) {
            await VideoJob.findByIdAndUpdate(currentJobId, { status: 'failed' });
        }

        /*Attempt to clean up any temp files that might have been created before the failure*/
        if (fs.existsSync(stitchedVideoPath)) fs.unlinkSync(stitchedVideoPath);
        if (fs.existsSync(extractedFramePath)) fs.unlinkSync(extractedFramePath);
        if (fs.existsSync(modifiedFramePath)) fs.unlinkSync(modifiedFramePath);
        return res.status(500).json({ error: 'An error occurred during video processing. Please try again later.' });
    }
});
export default router;