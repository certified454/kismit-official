import express from 'express';
import { HfInference } from '@huggingface/inference';
import { Buffer } from 'buffer';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const hf = new HfInference(process.env.HUGGING_FACE_HUB_TOKEN || '');

app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'GPU pipeline server is active!' });
});

app.post('/api/transform', async (req, res) => {
  try {
    const { imageBase64, prompt, negativePrompt } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Missing imageBase64' });
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    console.log(`\n[GPU] ⚡ Processing patch request...`);

    const MODELS = [
      'black-forest-labs/FLUX.1-schnell',
      'stabilityai/stable-diffusion-xl-refiner-1.0',
    ];

    let outputBuffer = null;
    let lastError    = null;

    for (const model of MODELS) {
      try {
        console.log(`[GPU] Trying engine model instance: ${model}`);
        
        // 💡 FLUX cannot take strength/guidance parameters or it completely crashes
        const isFlux = model.includes('flux');
        const parameters = isFlux 
          ? { prompt: prompt || 'high quality, realistic' }
          : {
              prompt: prompt || 'high quality, realistic',
              negative_prompt: negativePrompt || 'blurry, low quality',
              num_inference_steps: 25,
              guidance_scale: 7.5,
              strength: 0.75,
            };

        const response = await hf.imageToImage({
          model,
          inputs: buffer,
          parameters: parameters
        });

        let arrayBuffer;
        if (response instanceof ArrayBuffer) {
          arrayBuffer = response;
        } else if (response && typeof response.arrayBuffer === 'function') {
          arrayBuffer = await response.arrayBuffer();
        } else {
          throw new Error('Unexpected response format from HuggingFace');
        }

        outputBuffer = Buffer.from(arrayBuffer);
        console.log(`[GPU] ✅ Success with Engine: ${model}`);
        break;
      } catch (modelErr) {
        console.warn(`[GPU] ${model} interface bypassed: ${modelErr.message}`);
        lastError = modelErr;
      }
    }

    if (!outputBuffer) throw lastError || new Error('All models failed');
    res.json({ success: true, image: outputBuffer.toString('base64') });

  } catch (error) {
    console.error('\n❌ [GPU Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 GPU Server running on port ${PORT}`);
});