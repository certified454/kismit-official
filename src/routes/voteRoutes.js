import express, { request } from "express";
import Challenge from "../modules/challenge.js";
import Vote from "../modules/vote.js";
import protectRoute from "../middleware/auth.middleware.js";
const router = express.Router();
//route to vote on a challenge
router.post('/register', protectRoute, async (req, res) => {
    const { text } = req.body

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
        const newVote = new Vote({
            text,
            user: req.user.id,
            challenge: challenge._id
        });
        await newVote.save();
        console.log("Vote submitted:", newVote);
        res.status(201).json({ message: "Vote submitted", vote: newVote });
    } catch (error) {
        console.error("Error submitting vote:", error);
        res.status(500).json({ message: "Error submitting vote" });
    }
})

export default router;