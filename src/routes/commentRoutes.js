import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import Comment from '../modules/comment.js';
import User from '../modules/user.js';
import cloudinary from '../lib/cloudinary.js';

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
        }

        // Save audio to cloudinary if provided
        let audioUrl = null;
        if (audio) {
            const uploadedAudioToCloudinary = await cloudinary.uploader.upload(audio, {
                resource_type: 'auto',
            });
            audioUrl = uploadedAudioToCloudinary.secure_url;
        }

        const newComment = new Comment({
            text: text.trim(),
            audio: audioUrl,
            post: postId,
            user: req.user._id,
        })

        await newComment.save();
        console.log("comment save")
        
        res.status(201).json(newComment);
    } catch (error) {
        console.error(error, "error creating comment");
        res.status(500).json({ message: 'Internal server error', error: error.message});
    }
});

router.get("/post/:postId", protectRoute, async (req, res) =>{
    try {
        const { postId } = req.params

        const comments = await Comment.findOne({post: postId})
        .sort({ createdAt: -1 })
        .populate('user', 'username profilePicture')

        res.status(200).json({comments})
    } catch (error) {
        console.error("Error fetching comments", error)
        res.status(500).json({ message: 'Internal server error', error: error.message })
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