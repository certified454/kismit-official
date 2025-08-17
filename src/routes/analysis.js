import express from "express";
import protectRoute from '../middleware/auth.middleware.js';
import User from '../modules/user.js';
import cloudinary from '../lib/cloudinary.js'
import Analysis from '../modules/analysis.js';
import mongoose, { mongo } from 'mongoose';
const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {
    try {
        const { title, video } = req.body;
        if (!title && !video) {
            return res.status(400).json({ error: 'Title and video are required' });
        }

        const videoUrl = video;

        const newAnalysis = new Analysis({
            title,
            video: videoUrl,
            user: req.user._id
        })
        await newAnalysis.save();
        console.log(newAnalysis, 'new analysis created')

        const populatedAnalysis = await Analysis.findById(newAnalysis._id).populate('user', 'username profilePicture')
        req.app.get('io').emit('new analysis created', {
            _id: populatedAnalysis._id,
            user: {
                id: populatedAnalysis.user._id,
                username: populatedAnalysis.user.username,
                profilePicture: populatedAnalysis.user.profilePicture
            },
            title: populatedAnalysis.title,
            video: populatedAnalysis.video,
            createdAt: populatedAnalysis.createdAt
        })
        res.status(200).json({populatedAnalysis, success: true})
    } catch (error) {
        console.error('Error creating analysis:', error);
        res.status(500).json({error: 'error creating an analysis'})
    }
})

router.get('/', protectRoute, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const analysisId = req.params.analysisId;

        const analysis = await Analysis.aggregate([
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
                    title: 1,
                    video: 1,
                    createdAt: 1,
                    user: {
                        id: '$user._id',
                        username: '$user.username',
                        profilePicture: '$user.profilePicture'
                    }
                }
            }
        ])
        console.log(analysis, 'analysis fetched successfully')

        const totalAnlysis = await Analysis.countDocuments();
        res.send({
            analysis,
            currentPage: page,
            totalAnlysis,
            totalPages: Math.ceil(totalAnlysis / limit)
        })
    } catch (error) {
        console.error('Error fetching analysis:', error);
        res.status(500).json({error: 'Internal server error'})
    }
})
export default router;