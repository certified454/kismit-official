import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';
import ownerOnly from '../middleware/owner.middleware.js';
import Match from '../modules/match.js';

const router = express.Router();

// Register a new match
router.post('/register', protectRoute, ownerOnly, async (re, res) => {
    const { leagueName, matchDate, time, location, homeTeamName, awayTeamName, homeTeamLogo, awayTeamLogo } = re.body;

    try {
        if (!leagueName || !matchDate || !time || !homeTeamName || !awayTeamName || !homeTeamLogo || !awayTeamLogo) {
            console.log('all fields are required');
            return res.status(400).json({ message: 'All fields are required' });
        };

        const newMatch = new Match({
            leagueName,
            matchDate,
            time,
            location,
            homeTeamName,
            awayTeamName,
            homeTeamLogo,
            awayTeamLogo,
        });
        await newMatch.save();
        console.log('Match registered successfully', newMatch);

        req.io.emit('new match created', {
            _id: newMatch._id,
            leagueName: newMatch.leagueName,
            matchDate: newMatch.matchDate,
            time: newMatch.time,
            location: newMatch.location,
            homeTeamName: newMatch.homeTeamName,
            awayTeamName: newMatch.awayTeamName,
            homeTeamLogo: newMatch.homeTeamLogo,
            awayTeamLogo: newMatch.awayTeamLogo,
            createdAt: newMatch.createdAt,
            updatedAt: newMatch.updatedAt
        });
        res.status(201).json({ message: 'Match registered successfully', newMatch });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
})

export default router;