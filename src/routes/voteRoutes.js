import express, { request } from "express";
import Challenge from "../modules/challenge.js";
import Vote from "../modules/vote.js";
import protectRoute from "../middleware/auth.middleware.js";
const router = express.Router();
//route to vote on a challenge
router.post('/challenge/:challengeId', protectRoute, async (req, res) => {
    const { text } = req.body;
    const user = req.user._id;
    const challengeId = req.params.challengeId;
    try {
        if (!text) {
            console.log("No text provided");
            return res.status(400).json({ message: "No text provided" });
        }
        const challenge = await Challenge.findById(challengeId);
        if(!challenge) {
            console.log("Challenge not found");
            return res.status(404).json({ message: "Challenge not found" });
        }
        const existingUser = await Vote.findOne({ user, challenge: challenge._id });
        if(existingUser) {
            console.log("User has already voted on this challenge");
            return res.status(400).json({ message: "User has already voted on this challenge" });
        } else {
            const newVote = new Vote({
                text,
                user,
                challenge: challenge._id,
            });
            await Challenge.findByIdAndUpdate(challenge._id, { $inc: { voteCount: 1 } });
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

router.get('/challenge/:challengeId/votes', protectRoute, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    try {
        const votes = await Vote.aggregate([
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
                $project: {
                    _id: 1,
                    text: 1,
                    createdAt: 1,
                    user: {
                        _id: '$user._id',
                        username: '$user.username',
                        profilePicture: '$user.profilePicture'
                    }
                }
            }
        ])
        if (!votes) {
            console.log("No votes found");
            return res.status(404).json({ message: "No votes found" });
        }
        console.log("Votes retrieved:", votes);
        res.status(200).json({ votes });
    } catch (error) {
        console.error("Error retrieving votes:", error);
        res.status(500).json({ message: "Error retrieving votes" });
    }
})

export default router;