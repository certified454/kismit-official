import express, { request } from "express";
import Challenge from "../modules/challenge.js";
import Vote from "../modules/vote.js";
import protectRoute from "../middleware/auth.middleware.js";
import mongoose from "mongoose";
const router = express.Router();
//route to vote on a challenge by selecting options
router.post('/challenge/:challengeId', protectRoute, async (req, res) => {
    const { answers } = req.body; // answers is an object like { q1: 'optionValue', q2: 'optionValue' }
    const user = req.user._id;
    const challengeId = req.params.challengeId;
    
    try {
        // Validate inputs
        if (!answers || Object.keys(answers).length === 0) {
            console.log("No answers provided");
            return res.status(400).json({ message: "No answers provided" });
        }

        // Fetch the challenge
        const challenge = await Challenge.findById(challengeId);
        if (!challenge) {
            return res.status(404).json({ message: "Challenge not found" });
        }

        // Check if user has already voted on this challenge
        const existingVote = await Vote.findOne({ user, challenge: challengeId });
        if (existingVote) {
            console.log("User has already voted on this challenge");
            return res.status(400).json({ message: "User has already voted on this challenge" });
        }

        // Check time constraints
        const now = new Date();
        const startDate = new Date(challenge.startDate);
        const endDate = new Date(challenge.endDate);
        const challengeTime = new Date(challenge.time);

        startDate.setHours(challengeTime.getHours());
        startDate.setMinutes(challengeTime.getMinutes());
        startDate.setSeconds(0);

        // Allow voting only before challenge starts
        if (now >= startDate) {
            console.log("Challenge has started, voting is disabled");
            return res.status(400).json({ message: "Challenge has started, voting is disabled" });
        }

        // Dissable voting exactly at challenge start time
        if (now.getTime() === startDate.getTime()) {
            console.log("Challenge has started, voting is disabled");
            return res.status(400).json({ message: "Challenge has started, voting is disabled" });
        }
        
        // Dissable voting after challenge ends
        if (now > endDate) {
            console.log("Challenge has ended, voting is disabled");
            return res.status(400).json({ message: "Challenge has ended, voting is disabled" });
        }

        // Voting is allowed before challenge starts
        console.log("Voting is open, user can vote");

        // Validate that answers correspond to actual questions and options
        for (const [questionKey, answer] of Object.entries(answers)) {
            if (answer === null || answer === undefined) continue;
            
            // Extract the option value (handle both object format {option: "A"} and string format "A")
            const selectedValue = typeof answer === 'object' ? answer.option : answer;
            
            if (!selectedValue) continue;
            
            const questionIndex = parseInt(questionKey.replace('q', '')) - 1;
            const question = challenge.questions[questionIndex];
            
            if (!question) {
                return res.status(400).json({ message: `Invalid question: ${questionKey}` });
            }

            const optionExists = question.checkBox.some(opt => opt.option === selectedValue || opt.value === selectedValue);
            if (!optionExists) {
                return res.status(400).json({ message: `Invalid option for ${questionKey}` });
            }
        }

        // Create and save the vote
        const newVote = new Vote({
            answers,
            user,
            challenge: challengeId,
        });
        await newVote.save();

        // Update vote counts for selected options
        for (const [questionKey, answer] of Object.entries(answers)) {
            if (answer === null || answer === undefined) continue;
            
            // Extract the option value (handle both object format {option: "A"} and string format "A")
            const selectedValue = typeof answer === 'object' ? answer.option : answer;
            
            if (!selectedValue) continue;
            
            const questionIndex = parseInt(questionKey.replace('q', '')) - 1;
            await Challenge.updateOne(
                {
                    _id: challengeId,
                    'questions._id': challenge.questions[questionIndex]._id,
                    $or: [
                        { 'questions.checkBox.option': selectedValue },
                        { 'questions.checkBox.value': selectedValue }
                    ]
                },
                {
                    $addToSet: { 'questions.$[].checkBox.$[option].vote': user }
                },
                {
                    arrayFilters: [{ $or: [{ 'option.option': selectedValue }, { 'option.value': selectedValue }] }]
                }
            );
        }

        // Update challenge vote count
        await Challenge.findByIdAndUpdate(
            challengeId,
            {
                $addToSet: { vote: user },
                $inc: { voteCount: 1 }
            }
        );

        const populatedVote = await Vote.findById(newVote._id).populate('user', 'username avatarUrl').populate('challenge');
        req.app.get('io').emit('new vote created', {
            _id: populatedVote._id,
            user: {
                _id: populatedVote.user._id,
                username: populatedVote.user.username,
                avatarUrl: populatedVote.user.avatarUrl
            },
            answers: populatedVote.answers,
        });
        console.log("Vote submitted:", answers);
        res.status(201).json({ message: "Vote submitted successfully before challenge started", vote: newVote, populatedVote });
    } catch (error) {
        console.error("Error submitting vote:", error);
        res.status(500).json({ message: "Error submitting vote", error: error.message });
    }
})

router.get('/challenge/:challengeId/votes', protectRoute, async (req, res) => {
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const challengeId = req.params.challengeId;

        const challengeObjectId = new mongoose.Types.ObjectId(challengeId);
        const votes = await Vote.aggregate([
            {
                $match: { challenge: challengeObjectId }
            },
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
        const totalVotes = await Vote.countDocuments({challenge: challengeObjectId })
        return res.send({ 
            votes,
            currentPage: page,
            totalVotes,
            totalPages: Math.ceil(totalVotes / limit)
        });
    } catch (error) {
        console.error("Error retrieving votes:", error);
        res.status(500).json({ message: "Error retrieving votes" });
    }
})

export default router;