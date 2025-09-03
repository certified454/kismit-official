import express, { request } from "express";
import Challenge from "../modules/challenge.js";
import Vote from "../modules/vote.js";
import protectRoute from "../middleware/auth.middleware.js";
const router = express.Router();
//route to vote on a challenge
router.post('/challenge/all/vote', protectRoute, async (req, res) => {;
    const { text } = req.body

    try {
        if(!text) {
            console.log("No text provided");
            return res.status(400).json({ message: "No text provided" });
        } else {
            const votechallenge = await Challenge.findOne()
            .populate('user', 'username profilePicture')
            if(!votechallenge) {
                console.log("No active challenge found");
                return res.status(404).json({ message: "No active challenge found" });
            } 
            if(votechallenge.includes(req.user._id)){
                console.log("You have already voted on this challenge");
                return res.status(400).json({ message: "You have already voted on this challenge" });
            }
            else {
                const newVote = new Vote({
                    user: req.user._id,
                    challenge: votechallenge._id,
                    text
                });
                await newVote.save();
                console.log("Vote recorded successfully");
                res.status(201).json({ message: "Vote recorded successfully" });
            }
        }
    } catch (error) {
        console.error("Error recording vote:", error);
        res.status(500).json({ message: "Error recording vote" });
    }
})

export default router;