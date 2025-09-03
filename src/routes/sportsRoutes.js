import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';

const router = express.Router();

//define a route fetch sports data using sportmonk api
router.get('/fixtures', protectRoute, async (req, res) => {
    const SPORTMONK_API_TOKEN = process.env.SPORTMONKS_APIS;
    const baseUrl = `https://api.sportmonks.com/v3/football/livescores?api_token=${SPORTMONK_API_TOKEN}`;

    try {
        const response = await fetch(`${baseUrl}`);
        if (!response.ok) {
            const errorText = await response.text();
            console.log('Error fetching upcoming fixtures:', errorText);
            return res.status(response.status).json({ message: 'Error fetching upcoming fixtures', error: errorText });
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log('Fetched upcoming fixtures successfully', data);
            res.status(200).json(data);
        } else {
            const raw = await response.text();
            console.error('Non-JSON response from Sportmonks:', raw);
            res.status(500).json({ message: 'Invalid response from Sportmonks API', raw });
        }
    } catch (error) {
        console.error('Error fetching sports data:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
export default router;