import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';

const router = express.Router();

//define a route fetch sports data using sportmonk api
router.get('/fixtures', protectRoute, async (req, res) => {
    const SPORTMONK_API_TOKEN = process.env.SPORTMONKS_APIS;
    const baseUrl = 'https://api.sportmonks.com/v3/football/fixtures';
    const queryParams = `?api_token=${SPORTMONK_API_TOKEN}&include=league,season`;


    try {
        const response = await fetch(`${baseUrl}${queryParams}`);
        if (!response.ok) {
            console.log('Error fetching upcoming fixtures:', response.statusText);
            return res.status(response.status).json({ message: 'Error fetching upcoming fixtures' });
        };
        const data = await response.json();
        console.log('Fetched upcoming fixtures successfully');
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching sports data:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
})

export default router;