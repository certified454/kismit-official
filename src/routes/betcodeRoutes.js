import express from 'express';
import {
  detectBookie,
  parseBetcode,
  buildTargetBookieCode,
  supportedBookieList,
} from '../lib/betcodeConverter.js';

const router = express.Router();

router.post('/convert', async (req, res) => {
  const { code, sourceBookie, targetBookie } = req.body;

  // 1. Initial Request Check
  console.log(`\n========== 🚀 INCOMING CONVERSION REQUEST ==========`);
  console.log(`[INPUT] Received Code: "${code}"`);
  console.log(`[INPUT] Source Bookie (Explicit): ${sourceBookie || 'None (Using Auto-Detect)'}`);
  console.log(`[INPUT] Target Bookie: ${targetBookie}`);

  if (!code || !targetBookie) {
    console.warn(`❌ [Aborted] Missing code or targetBookie in request body.`);
    return res.status(400).json({
      message: 'Please provide both code and targetBookie in the request body.',
    });
  }

  try {
    // 2. Identify Source Platform
    const source = sourceBookie || detectBookie(code);
    console.log(`[DETECT] Final Evaluated Source: [${source}]`);
    
    if (!source) {
      console.warn(`❌ [Aborted] Unable to recognize source bookie format.`);
      return res.status(400).json({
        message: 'Unable to detect source bookie from the code. Please specify sourceBookie explicitly.',
        supportedBookies: supportedBookieList(),
      });
    }

    // 3. 🎯 FETCH AND PARSE (Added missing 'await')
    console.log(`[PARSE] Contacting ${source} remote systems to fetch ticket...`);
    const betSlip = await parseBetcode(code, source);
    
    // Check if games actually extracted successfully
    if (!betSlip || !betSlip.games || betSlip.games.length === 0) {
      console.warn(`⚠️ [Warning] Bet slip parsed, but contained zero games.`);
    } else {
      console.log(`✅ [Success] Successfully read ${betSlip.games.length} games from ${source}!`);
    }

    // 4. 🔄 TRANSLATE AND GENERATE (Added missing 'await')
    console.log(`[BUILD] Mapping extracted fixtures onto [${targetBookie.toLowerCase()}] pipeline...`);
    const convertedCode = await buildTargetBookieCode(betSlip, targetBookie);
    console.log(`🎁 [Output] Generated Code Result: ${convertedCode}`);
    console.log(`====================================================\n`);

    // 5. Send Clean Payload back to Expo Frontend
    res.status(200).json({
      message: 'Bet code converted successfully.',
      sourceBookie: source,
      targetBookie: targetBookie.toLowerCase(),
      originalCode: code,
      convertedCode,
      decodedSlip: betSlip // Named 'decodedSlip' to match your React Native interface requirements
    });

  } catch (error) {
    console.error('\n🚨 [CRASH] Fatal Error During Conversion Pipeline:');
    console.error(`- Error Message: ${error.message}`);
    console.error(`====================================================\n`);
    
    res.status(400).json({ 
      message: error.message, 
      supportedBookies: supportedBookieList() 
    });
  }
});

router.get('/supported', (req, res) => {
  res.status(200).json({ supportedBookies: supportedBookieList() });
});

export default router;