import express from 'express';

import News from "../modules/news.js"
import protectRoute from '../middleware/auth.middleware.js';
import User from '../modules/user.js';
import cloudinary from '../lib/cloudinary.js';

const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {
    const { description, pictures } = req.body;

    try {
        if (!description || !pictures || pictures.length === 0) {
            console.log('Missing required fields');
            return res.status(400).json({ message: 'Enter a description and add images to create a news article'});
        };
        const uploaderResponse = await cloudinary.uploader.upload(pictures);
        const pictureUrls = uploaderResponse.secure_url;

        const newNews = new News({
            description,
            pictures: pictureUrls,
            user: req.user._id
        });
        await newNews.save();

        const populatedNews = await News.findById(newNews._id)
        .populate('user', 'username profilePicture');

        req.app.get('io').emit('news created', {
            _id: populatedNews._id,
            user: {
                id: populatedNews.user._id,
                username: populatedNews.user.username,
                profilePicture: populatedNews.user.profilePicture
            },
            description: populatedNews.description,
            pictures: populatedNews.pictures,
            likesCount: populatedNews.likesCount,
            unlikesCount: populatedNews.unlikesCount,
            createdAt: populatedNews.createdAt
        })
        res.status(201).json({ success: true, message: 'News published successfully', news: newNews });
    } catch (error) {
        console.error("Error creating news article:", error);
        res.status(500).json({ message: "Server error" });
    }
})