import mongoose from "mongoose";
import express from "express";
import protectRoute from "../middleware/auth.middleware";
import ownerOnly from "../middleware/owner.middleware";
import Challenge from "../modules/challenge.js";

const router = express.Router();

router.post('/register', protectRoute, ownerOnly, async (req, res) => {
    const userId = req.user._id;
    const { title, description, pools, startDate, endDate} = req.body;

    try {
        if (!title || !description || !pools || !startDate || !endDate) {
            console.log(title, description, pools, startDate, endDate);
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
            pools,
            startDate,
            endDate,
            createdBy: userId
        });
        console.log(newChallenge);
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
                    pools: populatedChallenge.pools,
                    startDate: populatedChallenge.startDate,
                    endDate: populatedChallenge.endDate,
                })
        return res.status(201).json({ message: "Challenge created successfully", challenge: newChallenge });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
})

export default router;