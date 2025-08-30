import mongoose from "mongoose";
import express from "express";
import protectRoute from '../middleware/auth.middleware.js';
import ownerOnly from "../middleware/owner.middleware.js";
import Challenge from "../modules/challenge.js";

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
        console.log(newChallenge, "newChallenge");
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
        return res.status(201).json({ message: "Challenge created successfully", challenge: newChallenge });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

router.get('/all', protectRoute, async (req, res) => {
    try {
        const challenges = await Challenge.find().populate('user', 'username profilePicture');
        
        if(!challenges) {
            console.log("No challenges found");
            return res.status(404).json({ message: "No challenges found" });
        }
        res.send({ challenges, success: true})
        console.log(challenges, "fetched challenges");
    } catch (error) {
        return {
            success: false,
            message: error.message
        }
    }
})

export default router;