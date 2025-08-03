import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import Comment from '../modules/comment.js';
import User from '../modules/user.js';
import cloudinary from '../lib/cloudinary.js';
import mongoose from 'mongoose';

const router = express.Router();

router.post("/post/:postId", protectRoute, async (req, res) => {
    try {
        const postId = req.params.postId;
        const { text, audio } = req.body;


        const post = await Post.findById(postId) 
        if (!post) {
            console.log("Post not found with the ids")
            return res.status(404).json({message: "Post not found with the id"})
        } else if ( !text && !audio) {
            console.log("Missing required fields")
            return res.status(400).json({ message: "Missing required fields"})
        } else if ( text && audio ){
            console.log("You can only comment with text or audio at a time")
            return res.status(400).json({message: " You can only comment with text or audio at a time"})
        }

        // Save audio to cloudinary if provided
        let audioUrl = null;
        if (audio) {
            const today = new Date();
            today.setHours(0,0,0,0)
            const audioCountAudio = await Comment.countDocuments(
                {
                    user: req.user._id,
                    audio: {$ne: null},
                    createdAt: {$gte: today}
                }
            )
            if (audioCountAudio >= 3 ){
                console.log("You've reached your daily audio comment limit. Please subscribe to continue using audio comments")
                return res.status(400).json({message: "You've reached your daily audio comment limit. Please subscribe to continue using audio comments"})
            } else {
                    const uploadedAudioToCloudinary = await cloudinary.uploader.upload(audio, {
                        resource_type: 'auto',
                    });
                    audioUrl = uploadedAudioToCloudinary.secure_url;
                }

            }

        const newComment = new Comment({
            text: text.trim(),
            audio: audioUrl,
            post: postId,
            user: req.user._id,
        })

        await Post.findByIdAndUpdate(postId, {$inc: { commentsCount: 1}})

        await newComment.save();
        console.log("comment save")
        
        res.status(201).json(newComment);
    } catch (error) {
        console.error(error, "error creating comment");
        return res.status(500).json({ message: 'Internal server error', error: error.message});
    }
});

router.get("/post/:postId/comments", protectRoute, async (req, res) =>{
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const postId = req.params.postId

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            console.log('No comment yet be the first tocomment')
            return res.status(400).json({message: "Be the first to comment"})
        }

        const postObjectId = new mongoose.Types.ObjectId(postId);

        const comments = await Comment.aggregate([
            {
                $match: { post: postObjectId }
            },
            { 
                $sort: { createdAt: -1},
            },
            {
                $skip : skip
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
                    audio: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    user: {
                        _id: '$user._id',
                        username: '$user.username',
                        profilePicture: '$user.profilePicture'
                    }
                }
            }
        ])

        console.log("Comments fetched successfully");
        const totalComments = await Comment.countDocuments({post: postObjectId});
        return res.send({
            comments,
            currentPage: page,
            totalComments,
            totalPages: Math.ceil(totalComments / limit)
        })
        
    } catch (error) {
        console.error("Error fetching comments", error)
        return res.status(500).json({ message: 'Internal server error', error: error.message })
    }
})

router.delete("/:commentId", protectRoute, async (req, res) => {
    try {
        const comment = await Comment.findOneAndDelete({_id: req.params.commentId});

        if (!comment)  return res.stat(404).json({ messgae: " Comment not found"});

        await Post.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -1 }});
        
        res.json({ messgae: "Comment is deleted"});
    } catch (error) {
        console.error(error, "error deleting comment")
        res.status(500).json({message: "error deleting comment"})
    }
})

export default router;