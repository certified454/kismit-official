import express from 'express';
import sharp from 'sharp';
import { Buffer } from 'buffer';
 
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
 
const MODELSLAB_KEY = process.env.MODELSLAB_API_KEY;
 
app.get('/', (req, res) => {
  res.json({
    status:  'online',
    message: 'Lightning Node.js server — ModelsLab backend',
    keySet:  !!MODELSLAB_KEY,
  });
});
 
// ── Helper: poll ModelsLab for result (they use async queue) ──
// ModelsLab img2img is async — it returns a fetch_url to poll
async function pollForResult(fetchUrl, maxAttempts = 20, intervalMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
 
    const resp = await fetch(fetchUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key: MODELSLAB_KEY }),
    });
 
    const data = await resp.json();
    console.log(`[Poll ${i + 1}] status: ${data.status}`);
 
    if (data.status === 'success' && data.output?.[0]) {
      return data.output[0];   // returns image URL
    }
 
    if (data.status === 'error') {
      throw new Error(data.message || 'ModelsLab processing error');
    }
    // status === 'processing' — keep polling
  }
  throw new Error('ModelsLab timed out after max poll attempts');
}
 
// ── Helper: download image URL → Buffer ──────────────────────
async function urlToBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Image download failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}
 
// ── /api/transform ────────────────────────────────────────────
app.post('/api/transform', async (req, res) => {
  try {
    const {
      imageBase64,
      prompt,
      negativePrompt,
      strength = 0.7,
      steps    = 20,
    } = req.body;
 
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Missing imageBase64' });
    }
 
    if (!MODELSLAB_KEY) {
      return res.status(500).json({ success: false, error: 'MODELSLAB_API_KEY not set' });
    }
 
    // Get original dimensions to restore after processing
    const originalMeta = await sharp(Buffer.from(imageBase64, 'base64')).metadata();
 
    // ModelsLab accepts base64 directly via init_image parameter
    const base64Input = `data:image/jpeg;base64,${imageBase64}`;
 
    console.log(`\n[GPU] ⚡ Sending frame to ModelsLab — prompt: "${prompt?.slice(0, 80)}"`);
 
    // ── Call ModelsLab img2img endpoint ───────────────────────
    // Docs: https://modelslab.com/docs/stable-diffusion/img2img
    const apiResp = await fetch('https://modelslab.com/api/v6/realtime/img2img', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key:            MODELSLAB_KEY,
        prompt:         prompt        || 'high quality photo, realistic, sharp details',
        negative_prompt: negativePrompt || 'blurry, low quality, disfigured, watermark, text',
        init_image:     base64Input,
        strength:       strength,
        num_inference_steps: steps,
        guidance_scale: 7.5,
        width:          '512',
        height:         '512',
        samples:        '1',
        safety_checker: 'no',
        enhance_prompt: 'no',
        base64:         'yes',   // tells ModelsLab we're sending base64 input
      }),
    });
 
    const apiData = await apiResp.json();
    console.log('[ModelsLab] Response status:', apiData.status);
 
    let outputBuffer = null;
 
    if (apiData.status === 'success' && apiData.output?.[0]) {
      // Immediate result
      outputBuffer = await urlToBuffer(apiData.output[0]);
 
    } else if (apiData.status === 'processing' && apiData.fetch_result) {
      // Async queue — poll until done
      console.log('[ModelsLab] Job queued, polling for result...');
      const outputUrl = await pollForResult(apiData.fetch_result);
      outputBuffer = await urlToBuffer(outputUrl);
 
    } else {
      throw new Error(
        apiData.message || apiData.error || `Unexpected status: ${apiData.status}`
      );
    }
 
    // Resize output back to original frame dimensions
    const finalBuffer = await sharp(outputBuffer)
      .resize(originalMeta.width, originalMeta.height, { fit: 'fill' })
      .toFormat('jpeg', { quality: 92 })
      .toBuffer();
 
    console.log('[GPU] ✅ Frame processed successfully.');
    res.json({ success: true, image: finalBuffer.toString('base64') });
 
  } catch (error) {
    console.error('\n❌ [GPU Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
 
const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔥 Lightning Server running on port ${PORT}`);
  console.log(`   Backend: ModelsLab free tier (100 calls/day)`);
  console.log(`   MODELSLAB_API_KEY set: ${!!MODELSLAB_KEY}\n`);
});
 