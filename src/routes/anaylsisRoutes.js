import express from "express";
import protectRoute from '../middleware/auth.middleware.js';
import User from '../modules/user.js';
import cloudinary from 'lib/cloudinary.js';
import Analysis from '../modules/analysis.js';
import mongoose from 'mongoose';
const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {
    try {
        const { title, video } = req.body;
        if (!title || !video) {
            console.log('All fields are required')
            return res.status(400).json({message: 'All fields are required'})
        }

        const uploadVedioResponse = await cloudinary.uploader.upload(video, {
            resource_type: 'auto'
        });
        const videoUrl = uploadVedioResponse.secure_url;

        const newAnalysis = new Analysis({
            title,
            video: videoUrl,
            user: req.user._id
        })
        await newAnalysis.save();
        console.log(newAnalysis)

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
        res.status(201).json({message: 'error creating an analysis'})
    }
})
export default router;