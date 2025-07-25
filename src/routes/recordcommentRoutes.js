import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import RecordComment from '../modules/recordcomment.js';
import user from "../modules/user.js";
import moment from "moment-timezone";

const router = express.Router();

const dailyLimit = 2;

router.post("/recordcmment", protectRoute, async (req, res ) => {
    try {
        const { audioUrl, duration, postId } = req.body;
        const userId = req.user._id;

        if (!audioUrl || audioUrl.trim() === '') return res.status(404).json({ message: "Record field cannot be empty"})
        if (!duration || isNaN(duration) || duration <= 0) {
            return res.status(400).json({ message: "Invalid duration" });   
        }

        if (!postId) return res.status(400).json({ message: " Post not found"})

        const startOfToday = moment.utc().startOf('day').toDate();
        const endOfToday = moment.utc().endOf('day').toDate();

        const recordsTodayCount = await RecordComment.countDocuments({
            user: userId,
            createdAt: {
                $gte: startOfToday,
                $lte: endOfToday
            }
        })

        console.log(`User ${userId} has made ${recordsTodayCount} comments today.`);

        if ( recordsTodayCount >= dailyLimit ) return res.status(403).json({ message: `You have reached your ${dailyLimit} recording daily limit. Please subscribe for more! (Subscription coming soon)`})

        const newRecordComment = new RecordComment({
            audioUrl: audioUrl.trim(),
            duration: duration || 0,
            post: postId,
            user: userId,
        })

        await newRecordComment.save();
        res.status(201).json(newRecordComment)

    } catch (error) {
        console.error(error, "error creating recording comment");
        res.status(500).json({ message: "error creating recording comment" });
    }
});
//Important Note on Replies:
//Similar to text comments, this route will primarily fetch RecordComment documents where their post field matches postId. It does not inherently fetch nested replies (comments where parentComment is set). If you want to build a deeply nested comment tree on the frontend, you'll need to either:

//Fetch all comments for a post and then recursively organize them on the frontend based on their _id, parentComment, and parentCommentType.

//Implement more complex backend aggregation pipelines or separate API calls to fetch child replies as needed.



router.get("/recordcomment/:postId", protectRoute, async (req, res ) => {
    try {
        const record = await RecordComment.find( {post: req.params.postId}).sort({ createdAt: -1 }).populate("user", "username profilePicture")

        if (!record || record.length === 0) return res.status(404).json ({ message: "Records on this post will be display here "})

        record.status(201).json(record)
    } catch (error) {
        console.error(error, "error fetching record comments");
        res.status(500).json({ message: "error fetching record comments" });   
    }
})
export default router;