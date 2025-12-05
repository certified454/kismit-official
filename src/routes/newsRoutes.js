import express from 'express';

import News from "../modules/news.js"
import protectRoute from '../middleware/auth.middleware.js';
import User from '../modules/user.js';
import cloudinary from '../lib/cloudinary.js';
import mongoose from 'mongoose';

const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {
    const { description, picture1, picture2 } = req.body;

    try {
        if (!description || !picture1 || !picture2 || picture1.length === 0 || picture2.length === 0) {
            console.log('Missing required fields');
            return res.status(400).json({ message: 'Enter a description and add images to create a news article'});
        };

        const uploaderResponse1 = await cloudinary.uploader.upload(picture1);
        const picture1Url = uploaderResponse1.secure_url;

        const uploaderResponse2 = await cloudinary.uploader.upload(picture2);
        const picture2Url = uploaderResponse2.secure_url;

        const newNews = new News({
            description,
            picture1: picture1Url,
            picture2: picture2Url,
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
            picture1: populatedNews.pictures1,
            picture2: populatedNews.pictures2,
            likesCount: populatedNews.likesCount,
            unlikesCount: populatedNews.unlikesCount,
            createdAt: populatedNews.createdAt
        })
        res.status(201).json({ success: true, message: 'News published successfully', news: newNews });
    } catch (error) {
        console.error("Error creating news article:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// get all news by most engaged ( likes + unlikes)
router.get('/all', protectRoute, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const userObjectId = new mongoose.Types.ObjectId(req.user._id);

        const newsArticles = await News.aggregate([
            { $addFields: {
                totalEngagement: { $add: [ { $ifNull: ["$likesCount", 0] }, { $ifNull: ["$unlikesCount", 0] } ] },
                likedByUser: { $in: [ userObjectId, { $ifNull: ["$like", []] } ] },
                unlikedByUser: { $in: [ userObjectId, { $ifNull: ["$unlike", []] } ] }
            } },
            { $sort: { totalEngagement: -1 } },
            { $skip: skip },
            { $limit: limit },
            { $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'user'
            } },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            { $project: {
                _id: 1,
                description: 1,
                picture1: 1,
                picture2: 1,
                createdAt: 1,
                updatedAt: 1,
                user: {
                    _id: '$user._id',
                    username: '$user.username',
                    profilePicture: '$user.profilePicture'
                },
                likesCount: 1,
                unlikesCount: 1,
                likedByUser: 1,
                unlikedByUser: 1
            } }
        ]);

        const totalNewsCount = await News.countDocuments({}); 
        res.status(200).json({
            newsArticles,
            totalNewsCount,
            currentPage: page,
            totalPages: Math.ceil(totalNewsCount / limit)
        });
    } catch (error) {
        console.error("Error fetching news articles:", error);
        res.status(500).json({ message: "Server error" });
    }
});
//get one news article by id
router.get('/:newsId', protectRoute, async (req, res) =>{
    const newsId = req.params.newsId;
    try {
        if (!mongoose.Types.ObjectId.isValid(newsId)) {
            return res.status(400).json({ message: "Invalid news article ID." });
        }
        const newsArticle = await News.findById(newsId).populate('user', '_id username profilePicture');
        if (!newsArticle) {
            return res.status(404).json({ message: "News article not found." });
        }
        const likedByUser = newsArticle.like.some( id => id.toString() === req.user._id.toString());
        const unlikedByUser = newsArticle.unlike.some( id => id.toString() === req.user._id.toString());

        console.log(`Fetched news article: ${newsArticle._id}, likedByUser: ${likedByUser}, unlikedByUser: ${unlikedByUser}`);
        res.status(200).json({ newsArticle, likedByUser, unlikedByUser });
    } catch (error) {
        console.error("Error fetching news article:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.get('/earnings', protectRoute, async (req, res) => {
    // lets get the article id and check how many likes and unlikes it has
    const userId = req.user._id;
    const newsId = req.query.newsId;
    try {
        if (!newsId) {
            console.log('News article ID is required.');
            return  res.status(400).json({ message: "News article ID is required." });
        };
        if (!mongoose.Types.ObjectId.isValid(newsId)) {
            console.log('Invalid news article ID.');
            return res.status(400).json({ message: "Invalid news article ID." });
        };
        
        const newsArticle = await News.findById( newsId);
        if (newsArticle.user.toString() !== userId.toString()) {
            return res.status(403).json({ message: "You are not authorized to view earnings for this news article." });
        };
        if (!newsArticle) {
            console.log('News article not found.');
            return res.status(404).json({ message: "News article not found." });
        };
        if (newsArticle.likesCount === 0 && newsArticle.unlikesCount === 0) {
            console.log('No likes or unlikes for this news article.');
            return res.status(200).json({ totalPoints: 0, totalEarnings: 0 });
        } 
        
        //calculate earnings
        const totalPoints = newsArticle.likesCount * 2 + newsArticle.unlikesCount * 1;
        const totalEarnings = (totalPoints * 0.05).toFixed(2);

        console.log(`Total points: ${totalPoints}, Total earnings: $${totalEarnings}`);
        return res.status(200).json({ totalPoints, totalEarnings });
    } catch (error) {
        console.error("Error calculating earnings for news article:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// get all earning for a user dashboard
router.get('/dashboard/earnings', protectRoute, async (req, res) => {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    try {
        // Get all news articles for this user with earnings breakdown
        const newsArticles = await News.aggregate([
            { $match: { user: userId } },
            { $addFields: {
                points: {
                    $add: [
                        { $multiply: [ { $ifNull: ["$likesCount", 0] }, 2 ] },
                        { $multiply: [ { $ifNull: ["$unlikesCount", 0] }, 1 ] }
                    ]
                },
                earnings: {
                    $multiply: [
                        { $add: [
                            { $multiply: [ { $ifNull: ["$likesCount", 0] }, 2 ] },
                            { $multiply: [ { $ifNull: ["$unlikesCount", 0] }, 1 ] }
                        ] },
                        0.05
                    ]
                },
                date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
                time: { $dateToString: { format: "%H:%M:%S", date: "$createdAt", timezone: "UTC" } }
            } },
            { $sort: { createdAt: -1 } },
            { $project: {
                _id: 1,
                description: 1,
                picture1: 1,
                picture2: 1,
                date: 1,
                time: 1,
                likesCount: 1,
                unlikesCount: 1,
                points: 1,
                earnings: { $round: ["$earnings", 2] }
            } }
        ]);

        // Calculate daily earnings summary
        const earningsData = await News.aggregate([
            { $match: { user: userId } },
            { $project: {
                date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
                points: {
                    $add: [
                        { $multiply: [ { $ifNull: ["$likesCount", 0] }, 2 ] },
                        { $multiply: [ { $ifNull: ["$unlikesCount", 0] }, 1 ] }
                    ]
                }
            } },
            { $group: {
                _id: '$date',
                totalPoints: { $sum: '$points' }
            } },
            { $sort: { _id: -1 } }
        ]);

        const earningByDay = earningsData.map(d => ({
            date: d._id,
            totalPoints: d.totalPoints,
            totalEarnings: Number((d.totalPoints * 0.05).toFixed(2))
        }));

        // Get today's and yesterday's totals
        const now = new Date();
        const todayDate = now.toISOString().split('T')[0];
        const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const todayEntry = earningByDay.find(e => e.date === todayDate) || { date: todayDate, totalPoints: 0, totalEarnings: 0 };
        const yesterdayEntry = earningByDay.find(e => e.date === yesterdayDate) || { date: yesterdayDate, totalPoints: 0, totalEarnings: 0 };

        // Calculate total balance (all-time earnings)
        const totalBalance = earningByDay.reduce((sum, d) => sum + d.totalEarnings, 0);

        // Past totals (excluding today and yesterday)
        const past = earningByDay.filter(e => e.date !== todayDate && e.date !== yesterdayDate);
        const pastTotals = past.reduce((acc, e) => ({
            totalPoints: acc.totalPoints + e.totalPoints,
            totalEarnings: acc.totalEarnings + e.totalEarnings
        }), { totalPoints: 0, totalEarnings: 0 });

        res.status(200).json({
            balance: Number(totalBalance.toFixed(2)),
            articles: newsArticles,  // Individual articles with date, time, amount
            summary: {
                today: todayEntry,
                yesterday: yesterdayEntry,
                pastTotals,
                allTime: {
                    totalPoints: earningByDay.reduce((sum, d) => sum + d.totalPoints, 0),
                    totalEarnings: Number(totalBalance.toFixed(2))
                }
            },
            earningByDay  // Daily breakdown
        });

    } catch (error) {
        console.error("Error fetching dashboard earnings:", error);
        res.status(500).json({ message: "Server error" });
    }
});
export default router;