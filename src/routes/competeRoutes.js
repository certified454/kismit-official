import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';
import Team from '../modules/compete.js';
import Player from '../modules/compete.js';
import Compete from '../modules/compete.js';

const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {
    const { name, teams, creatorId, targetedUserId } = req.body;
    try {
        if (!name) {
            console.log('Name is required');
            return res.status(400).json({ error: 'Name is required' });
        };
        if (!teams || teams.length < 2) {
            console.log('At least two teams are required');
            return res.status(400).json({ error: 'At least two teams are required' });
        };
        if(!creatorId || !targetedUserId){ 
            return res.status(400).json({ error: 'creatorId and targetedUserId are required' });
        }
    
        const creator = await User.findById(creatorId);
        const targetedUser = await User.findById(targetedUserId);
        if (!creator || !targetedUser) {
            return res.status(404).json({ error: 'creator or targeted user not found' });
        }
        const newCompete = new Compete({
            name,
            teams,
            creator: creator._id,
            targetedUser: targetedUser._id,
        });
        await newCompete.save();
        res.status(201).json({ message: 'Compete created successfully', compete: newCompete });
    } catch (error) {
        console.error('Error creating compete:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

export default router;