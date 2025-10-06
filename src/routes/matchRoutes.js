import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';
import ownerOnly from '../middleware/owner.middleware.js';
import Match from "../modules/match.js";
import cloudinary from '../lib/cloudinary.js';

const router = express.Router();

// Register a new match
router.post('/register', protectRoute, ownerOnly, async (req, res) => {
    const { leagueName, matchDate, time, location, homeTeamName, awayTeamName, homeTeamLogo, awayTeamLogo } = req.body;
    try {
        if (!leagueName || !matchDate || !time || !homeTeamName || !awayTeamName || !homeTeamLogo || !awayTeamLogo) {
            console.log('all fields are required');
            return res.status(400).json({ message: 'All fields are required' });
        };
        // upload homeTeamLogo to cloudinary
        const uploadHomeTeamLogoResponse = await cloudinary.uploader.upload(homeTeamLogo);
        const homeTeamLogoUrl = uploadHomeTeamLogoResponse.secure_url;
        // upload awayTeamLogo to cloudinary
        const uploadAwayTeamLogoResponse = await cloudinary.uploader.upload(awayTeamLogo);
        const awayTeamLogoUrl = uploadAwayTeamLogoResponse.secure_url;
        const newMatch = new Match({
            leagueName,
            matchDate,
            time,
            location,
            homeTeamName,
            awayTeamName,
            homeTeamLogo: homeTeamLogoUrl,
            awayTeamLogo: awayTeamLogoUrl
        });
        await newMatch.save();

        req.app.get('io').emit('new match created', {
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

router.get('/', protectRoute, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
        const matches = await Match.aggregate([
            {
                $sort: { createdAt: -1 }
            },
            {
                $skip: skip
            },
            {
                $limit: limit
            },
            {
                $project: {
                    leagueName: 1,
                    matchDate: 1,
                    time: 1,
                    location: 1,
                    homeTeamName: 1,
                    awayTeamName: 1,
                    homeTeamLogo: 1,
                    awayTeamLogo: 1
                }
            }
        ])
        const totalMatches = await Match.countDocuments();
        
        res.status(200).json({
            matches,
            totalPages: Math.ceil(totalMatches / limit),
            currentPage: page
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
})
export default router;