import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';
import Team from '../modules/compete.js';
import Player from '../modules/compete.js';
import Compete from '../modules/compete.js';

const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {
    const { name, players, teams } = req.body;
    try {
        if (!name) {
            console.log('Name is required');
            return res.status(400).json({ error: 'Name is required' });
        };
        if (!players || players.length < 1) {
            console.log('At least one player is required');
            return res.status(400).json({ error: 'At least one player is required' });
        };
        if (!teams || teams.length < 2) {
            console.log('At least two teams are required');
            return res.status(400).json({ error: 'At least two teams are required' });
        };
        const newCompete = new Compete({
            name,
            players,
            teams,
        });
        await newCompete.save();
        res.status(201).json({ message: 'Compete created successfully', compete: newCompete });
    } catch (error) {
        console.error('Error creating compete:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

export default router;