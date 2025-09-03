import express, { request } from "express";
import Challenge from "../modules/challenge.js";
import Vote from "../modules/vote.js";
import protectRoute from "../middleware/auth.middleware.js";
const router = express.Router();
//route to vote on a challenge
router.post('/register', protectRoute, async (req, res) => {
    const { text } = req.body;
    const user = req.user._id;
    try {
        if (!text) {
            console.log("No text provided");
            return res.status(400).json({ message: "No text provided" });
        }
        const challenge = await Challenge.findOne();
        if(!challenge) {
            console.log("Challenge not found");
            return res.status(404).json({ message: "Challenge not found" });
        }
        const existingVote = await Vote.findOne({ user, challenge: challenge._id });
        if(existingVote) {
            console.log("User has already voted on this challenge");
            return res.status(400).json({ message: "User has already voted on this challenge" });
        } else {
            const newVote = new Vote({
                text,
                user,
                challenge: challenge._id
            });
            await newVote.save();
            const populatedVote = await Vote.findById(newVote._id).populate('user', 'username avatarUrl').populate('challenge');
            req.app.get('io').emit('new vote created', {
                _id: populatedVote._id,
                user: {
                    _id: populatedVote.user._id,
                    username: populatedVote.user.username,
                    avatarUrl: populatedVote.user.avatarUrl
                },
                text: populatedVote.text,
            })
            console.log("Vote submitted:", newVote);
            res.status(201).json({ message: "Vote submitted", vote: newVote, populatedVote });
        }
    } catch (error) {
        console.error("Error submitting vote:", error);
        res.status(500).json({ message: "Error submitting vote" });
    }
})

export default router;