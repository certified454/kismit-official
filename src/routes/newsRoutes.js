import express from 'express';

import News from "../modules/news.js"
import protectRoute from '../middleware/auth.middleware.js';
import User from '../modules/user.js';
import cloudinary from '../lib/cloudinary.js';
import mongoose from 'mongoose';

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
});

// get all news by most engaged ( likes + unlikes)
router.get('/all', protectRoute, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit= parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const userObjectId = mongoose.Types.ObjectId(req.user._id);
        const newsArticles = await News.aggregate(
            [
            // Calculate total engagement and sort by it
                { $addFields: {
                        totalEngagement: { $add: [ '$likesCount', '$unlikesCount' ]},
                        likedByUser: {
                            $in: [userObjectId, { $ifNull: [ '$likedBy', [] ]}]
                        },
                        unlikedByUser: {
                            $in: [userObjectId, { $ifNull: [ '$unlikedBy', [] ]}]
                        }
                    }
                },
                { $sort:  
                    { totalEngagement: -1}
                },
                { $skip: skip },
                { $limit: limit },
                { $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'user'
                } },
                { $unwind: '$user' },
                { $project: {
                    _id: 1,
                    description: 1,
                    pictures: 1,
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
                }}
            ]
        );
        const totalNewsCount = await News.countDocuments();
        res.send({
            newsArticles, 
            totalNewsCount,
            currentPage: page,
            totalPages: Math.ceil(totalNewsCount / limit)
        })
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
    const userId = req.user._id;
    try {
        //display list of news articles which the user got earnings in that particular day. also show total earnings for that day
        const earningsData = await News.aggregate([
            { $match: { user: mongoose.Types.ObjectId(userId) } },

            { $project: {
                date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: 'UTC' } },
                points: { 
                    $add: [
                        { $multiply: [ {$ifNull: ["$likesCount", 0] }, 2 ] },
                        { $multiply: [{ $ifNull: ["$unlikesCount", 0] }, 1 ] }
                    ]
                }
            }
            },
            {
                $group: {
                    _id: '$date',
                    totalPoints: { $sum: '$points' },
                }
            },
            { $sort: { _id: -1 } }
        ]);

        //map earnings data to include total earnings
        const earningByDay = earningsData.map(d => ({
            date: d._id,
            totalPoints: d.totalPoints,
            totalEarnings: Number(d.totalPoints * 0.05).toFixed(2)
        }));

        //convert yyyy-mm-dd to a more readable format
        const toUTCDateString = dt => new Date(dt).toString().slice(0, 10);
        const now = new Date();
        const today = toUTCDateString(now);
        const yesterday = toUTCDateString(new Date(now.getTime() -24 * 60 * 60 * 1000));

        const toayEntry = earningByDay.find( e => e._id === today) || { date: today, totalPoints: 0, totalEarnings: (0).toFixed(2) }; 
        const yesterdayEntry = earningByDay.find( e => e._id === yesterday) || { date: yesterday, totalPoints: 0, totalEarnings: (0).toFixed(2) };

        // past totals exclude today and yesterday
        const past = earningsData.filter( e => e._id !== today && e._id !== yesterday);
        const pastTotals = past.map( d => ((acc, e) => {
            acc.totalPoints += e.totalPoints;
            acc.totalEarnings += e.totalEarnings;
            console.log('Accumulating past totals:', acc);
            return acc;
        }, { totalPoints: 0, totalEarnings: 0}));

        pastTotals.totalEarnings = Number(pastTotals.totalEarnings).toFixed(2);

        console.log({
            'earningByDay': earningByDay,
            'today': toayEntry,
            'yesterday': yesterdayEntry,
            'pastTotals': pastTotals
        });

        res.status(200).json({
            earningByDay,
            today: toayEntry,
            yesterday: yesterdayEntry,
            pastTotals
        })

    } catch (error) {
        console.error("Error fetching dashboard earnings:", error);
        res.status(500).json({ message: "Server error" });
    }
});
export default router;