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
        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ message: "Post not found with the id" });
        }
        if (!text && !audio) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        if (text && audio) {
            return res.status(400).json({ message: "You can only comment with text or audio at a time" });
        }
        let audioUrl = null;
        if (audio) {
            const uploadedAudioToCloudinary = await cloudinary.uploader.upload(audio, {
                resource_type: 'auto',
            });
            audioUrl = uploadedAudioToCloudinary.secure_url;
        }

        const newComment = new Comment({
            text: text ? text.trim() : undefined,
            audio: audioUrl,
            post: postId,
            user: req.user._id,
        });

        await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } });

        await newComment.save();
        const populatedComment = await Comment.findById(newComment._id).populate('user', 'username profilePicture');
        req.app.get('io').emit('new comment created', {
            _id: populatedComment._id,
            postId: populatedComment.post,
            user: {
                id: populatedComment.user._id,
                username: populatedComment.user.username,
                profilePicture: populatedComment.user.profilePicture
            },
            text: populatedComment.text,
            audio: populatedComment.audio,
            createdAt: populatedComment.createdAt
        });
        console.log(newComment)
        res.status(201).json(populatedComment);
    } catch (error) {
        console.error(error, "error creating comment");
        return res.status(500).json({ message: 'Internal server error', error: error.message });
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
router.get("/post/:postId/:commentId", protectRoute, async (req, res) => {
    const commentId = req.params.commentId
    try {
        const comment = await Comment.findById(commentId)
        .populate('user', 'username profilePicture')

        res.send({ comment });
    } catch (error) {
        console.error(error, "error fetching user comment");
        res.status(500).json({ message: "error fetching user comments" });
    }
})
router.put('/:postId/:commentId', protectRoute, async (req, res) => {
    const commentId = req.params.commentId;
    const { text } = req.body;

    try {
        const comment = await Comment.findById(commentId)
        if (!comment) {
            console.log("Comment not found")
            return res.status(404).json({message: 'comment not found'});
        };
        if(comment.user.toString() !== comment.user._id.toString()) {
            console.log("Unauthorized to update this comment")
            return res.status(401).json({message: 'Unauthorized'})
        };
        if(!text) {
            console.log("No text found to update")
            return res.status(404).json({message: 'text not found', comment})
        };
        if(text === comment.text) {
            console.log("No changes applied")
            return res.status(404).json({message: "no changes applied", comment})
        };
        comment.caption = caption;

        await comment.save();
        res.status(200).json({comment})
    } catch (error) {
        console.log(error, "failed to update comment")
        res.status(500).json({message: "Failed to update comment"})
    }
})
router.delete("/id", protectRoute, async (req, res) => {
    try {
        const commentId = req.params.commentId

        const comment = await Comment.findById(commentId)
        if (!comment)  return res.stat(404).json({ messgae: " Comment not found"});

        if (comment.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: "Unauthorized" })
        }
        await comment.deleteOne();
        await Post.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -1 }});
        
        res.json({ messgae: "Comment is deleted"});
    } catch (error) {
        console.error(error, "error deleting comment")
        res.status(500).json({message: "error deleting comment"})
    }
});

export default router;