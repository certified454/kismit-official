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

  if (!code || !targetBookie) {
    return res.status(400).json({
      message: 'Please provide both code and targetBookie in the request body.',
      example: {
        code: 'SPORTY-123-456',
        sourceBookie: 'sportybet',
        targetBookie: '1xbet',
      },
    });
  }

  try {
    const source = sourceBookie || detectBookie(code);
    if (!source) {
      return res.status(400).json({
        message:
          'Unable to detect source bookie from the code. Please specify sourceBookie explicitly.',
        supportedBookies: supportedBookieList(),
      });
    }

    const betSlip = parseBetcode(code, source);
    const convertedCode = buildTargetBookieCode(betSlip, targetBookie);

    res.status(200).json({
      message: 'Bet code converted successfully.',
      sourceBookie: source,
      targetBookie: targetBookie.toLowerCase(),
      originalCode: code,
      convertedCode,
      betSlip,
    });
  } catch (error) {
    console.error('Betcode conversion error:', error);
    res.status(400).json({ message: error.message, supportedBookies: supportedBookieList() });
  }
});

router.get('/supported', (req, res) => {
  res.status(200).json({ supportedBookies: supportedBookieList() });
});

export default router;
