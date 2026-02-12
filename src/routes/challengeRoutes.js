import mongoose from "mongoose";
import express from "express";
import protectRoute from '../middleware/auth.middleware.js';
import ownerOnly from "../middleware/owner.middleware.js";
import Challenge from "../modules/challenge.js";
import Vote from "../modules/vote.js";
import cloudinary from '../lib/cloudinary.js';

const router = express.Router();

router.post('/register', protectRoute, ownerOnly, async (req, res) => {
    const user = req.user
    const { leagueImage, title, description, time, questions, startDate, endDate, } = req.body;

    try {
        if (!leagueImage || !title || !description || !questions || !startDate || !endDate) {
            console.log('all fields are required');
            return res.status(400).json({ message: "All fields are required" });
        }
        if (new Date(startDate) >= new Date(endDate)) {
            console.log("Invalid date range");
            return res.status(400).json({ message: "End date must be after start date" });
        }
        if (!Array.isArray(questions) || questions.length === 0) {
            console.log("Invalid questions");
            return res.status(400).json({ message: "At least one question is required" });
        }
        // validate question structure
        const valid = questions.every(q => q && typeof q.text === 'string' && Array.isArray(q.checkBox) && q.checkBox.length >= 2 && q.checkBox.every(opt => opt && typeof opt.option === 'string' && typeof opt.value === 'string'));
        if (!valid) {
            console.log('Invalid question structure');
            return res.status(400).json({ message: 'Each question must have `text` and at least two `checkBox` options with `option` and `value`' });
        }
        // Validate and prepare leagueImage for Cloudinary upload
        // Accepts: data URIs (data:image/png;base64,..., data:image/jpg;base64,..., etc), http/https URLs, or local file:// URIs
        if (typeof leagueImage !== 'string' || leagueImage.trim().length === 0) {
            return res.status(400).json({ message: 'leagueImage must be a non-empty string' });
        }
        if (!leagueImage.startsWith('data:image/') && !leagueImage.startsWith('http://') && !leagueImage.startsWith('https://') && !leagueImage.startsWith('file://') && !leagueImage.startsWith('content://')) {
            return res.status(400).json({ message: 'leagueImage must be a data URI (data:image/...), HTTP(S) URL, or device file URI' });
        }
        const uploadResponse = await cloudinary.uploader.upload(leagueImage);
        const leagueImageUrl = uploadResponse.secure_url;
        const newChallenge = new Challenge({
            leagueImage: leagueImageUrl,
            title,
            description,
            time,
            questions,
            startDate,
            endDate,
            user: req.user._id
        });

        await newChallenge.save();
        // first get all users apart from isOwner and send them a notification about the new challenge
        const allUsers =  await mongoose.model('User').find({
             _id: { $ne: user._id },
             expoPushToken: { $exists: true, $ne: null }
        }).select('expoPushToken _id');

        const sendPromises = allUsers.map((usr) => {
            fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: usr.expoPushToken,
                    title: 'This Week Challenge is Live!',
                    body: `Check out what is live now: ${newChallenge.title}, Remember early entries stand a chance to win cash prizes`,
                    data: { challengeId: newChallenge._id.toString() },
                })
            }).catch((error) => ({ ok: false, error: error, userId: usr._id }));
        });
        const results = await Promise.allSettled(sendPromises);
        results.forEach((result, idx) => {
            if (result.status === 'rejected' || (result.value && result.value.ok === false)) {
                console.error(`Failed to send notification to user ${allUsers[idx]._id}:`, result.reason || result.value.error);
            }
        })

        const populatedChallenge = await Challenge.findById(newChallenge._id).populate('user', 'username profilePicture');
    
        req.app.get('io').emit('new challenge created', {
            _id: populatedChallenge._id,
            user: {
                id: populatedChallenge.user._id,
                username: populatedChallenge.user.username,
                profilePicture: populatedChallenge.user.profilePicture
            },
            leagueImage: populatedChallenge.leagueImage,
            title: populatedChallenge.title,
            description: populatedChallenge.description,
            time: populatedChallenge.time,
            questions: populatedChallenge.questions,
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
                leagueImage: 1,
                title: 1,
                description: 1,
                time: 1,
                questions: 1,
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

// Owner posts correct answers after challenge finished; compute scores and ranks
router.put('/:challengeId/answers', protectRoute, ownerOnly, async (req, res) => {
    const challengeId = req.params.challengeId;
    const { correctAnswers } = req.body; // expected format: { q1: 'A', q2: 'B' }

    try {
        if (!correctAnswers || typeof correctAnswers !== 'object') {
            return res.status(400).json({ message: 'correctAnswers object is required' });
        }

        const challenge = await Challenge.findById(challengeId);
        if (!challenge) return res.status(404).json({ message: 'Challenge not found' });

        // Save correct answers on challenge
        challenge.correctAnswers = correctAnswers;
        challenge.answersPostedAt = new Date();
        await challenge.save();

        // Fetch all votes for this challenge
        const votes = await Vote.find({ challenge: challengeId });

        // Compute score for each vote
        const scoreEntries = votes.map(vote => {
            let score = 0;
            try {
                for (const [qKey, correctValue] of Object.entries(correctAnswers)) {
                    const ans = vote.answers[qKey];
                    if (ans === null || ans === undefined) continue;
                    const selectedValue = typeof ans === 'object' ? ans.option : ans;
                    if (!selectedValue) continue;
                    if (String(selectedValue) === String(correctValue)) score += 20;
                }
            } catch (e) {
                // ignore malformed vote answers
            }
            return { id: vote._id, score, createdAt: vote.createdAt };
        });

        // Sort by score desc then earliest submission (createdAt asc) as tiebreaker
        scoreEntries.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        // Assign ranks
        const bulkOps = [];
        for (let i = 0; i < scoreEntries.length; i++) {
            const entry = scoreEntries[i];
            const rank = i + 1;
            bulkOps.push({
                updateOne: {
                    filter: { _id: entry.id },
                    update: { $set: { score: entry.score, rank } }
                }
            });
        }

        if (bulkOps.length > 0) {
            await Vote.bulkWrite(bulkOps);
        }

        // Emit socket event with top rankings
        const top = scoreEntries.slice(0, 10);
        const populatedTop = await Vote.find({ _id: { $in: top.map(t => t.id) } }).populate('user', 'username profilePicture');
        req.app.get('io').emit('challenge:answersUpdated', { challengeId, top: populatedTop });

        res.json({ message: 'Correct answers saved and scores computed', topCount: top.length });
    } catch (error) {
        console.error('Error posting answers:', error);
        res.status(500).json({ message: 'Error posting answers', error: error.message });
    }
});

export default router;