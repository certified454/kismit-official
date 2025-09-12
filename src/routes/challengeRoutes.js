import mongoose from "mongoose";
import express from "express";
import protectRoute from '../middleware/auth.middleware.js';
import ownerOnly from "../middleware/owner.middleware.js";
import Challenge from "../modules/challenge.js";
import Vote from "../modules/vote.js";

const router = express.Router();

router.post('/register', protectRoute, ownerOnly, async (req, res) => {
    const { title, description, time, pools, startDate, endDate, } = req.body;

    try {
        if (!title || !description || !pools || !startDate || !endDate) {
            console.log('all fields are required');
            return res.status(400).json({ message: "All fields are required" });
        }
        if (new Date(startDate) >= new Date(endDate)) {
            console.log("Invalid date range");
            return res.status(400).json({ message: "End date must be after start date" });
        }
        if (!Array.isArray(pools) || pools.length === 0) {
            console.log("Invalid pool count");
            return res.status(400).json({ message: "At least one pool is required" });
        }
        const newChallenge = new Challenge({
            title,
            description,
            time,
            pools, 
            startDate,
            endDate,
            user: req.user._id
        });
        await newChallenge.save();

        const populatedChallenge = await Challenge.findById(newChallenge._id).populate('user', 'username profilePicture');
                req.app.get('io').emit('new challenge created', {
                    _id: populatedChallenge._id,
                    user: {
                        id: populatedChallenge.user._id,
                        username: populatedChallenge.user.username,
                        profilePicture: populatedChallenge.user.profilePicture
                    },
                    title: populatedChallenge.title,
                    description: populatedChallenge.description,
                    time: populatedChallenge.time,
                    pools: populatedChallenge.pools,
                    startDate: populatedChallenge.startDate,
                    endDate: populatedChallenge.endDate,
                    createdBy: populatedChallenge.createdBy
                })
        res.status(201).json({ message: "Challenge created successfully", populatedChallenge, newChallenge });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.get("/all", protectRoute, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const challenges = await Challenge.aggregate([
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
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'user'
            }
        },
        {
            $unwind: '$user'
        },
        {
            $lookup: {
                from: 'votes',
                localField: '_id',
                foreignField: 'challenge',
                as: 'votes'
            }
        },
        {
            $addFields: {
                voteCount: { $size: '$votes' },
            }
        },
        {
            $project: {
                _id: 1,
                title: 1,
                description: 1,
                time: 1,
                pools: 1,
                startDate: 1,
                isChallengeActive: 1,
                endDate: 1,
                createdAt: 1,
                updatedAt: 1,
                user: {
                    _id: '$user._id',
                    username: '$user.username',
                    profilePicture: '$user.profilePicture'
                },
                voteCount: 1
            }
        }
    ])
    const totalChallenge = await Vote.countDocuments();
    res.send({ challenges, currentPage: page,  totalChallenge, totalPages: Math.ceil(totalChallenge / limit),});
})

router.get('/:challengeId', protectRoute, async (req, res) => {
    const challengeId = req.params.challengeId;
    const user = req.user._id;

    try {
        const challenge = await Challenge.findById(challengeId)
            .populate('user', 'username profilePicture');
        if (!challenge) {
            return res.status(404).json({ message: "Challenge not found" });
        }
        const totalVotes = await Vote.countDocuments({ challenge: challengeId });
        res.send({ challenge, totalVotes });
    } catch (error) {
        console.error("Error retrieving challenge:", error);
        res.status(500).json({ message: "Error retrieving challenge" });
    }
})

export default router;