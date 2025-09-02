import express from 'express';
import protectRoute from '../middleware/authMiddleware.js';

const router = express.Router();

//define a route fetch sports data using sportmonk api
router.get('/upcoming-fixtures', protectRoute, async (req, res) => {
    const SPORTMONK_API_TOKEN = process.env.SPORTMONKS_APIS
    try {
        const response = await fetch(`https://api.sportmonks.com/v3/football/fixtures/upcoming/markets/2`, {
            params: {
                api_token: SPORTMONK_API_TOKEN,
                include: 'league,season'
            }
        })
        if (!response.ok) {
            console.log('Error fetching upcoming fixtures:', response.statusText);
            return res.status(response.status).json({ message: 'Error fetching upcoming fixtures' });
        };
        console.log('Fetched upcoming fixtures successfully');
        res.status(200).json(await response.json());
    } catch (error) {
        console.error('Error fetching sports data:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
})

export default router;