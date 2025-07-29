import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import Comment from '../modules/comment.js';
import User from '../modules/user.js';

const router = express.Router();

router.post("/comment", protectRoute, async (req, res) => {
    try {
        const { postId } = req.params;
        const { userId } = req.user._id
        const { text, audioUrl } = req.body;

        if (!postId || !userId || (!text && !audioUrl) ) return res.status(400).json({ message: "Missing required fields"})
        
        const post = await Post.findById(postId) 
        if (!post) {
            return res.status(404).json({message: "Post not found with the id"})
        } else {
            
        }

        const newComment = new Comment({
            post: postId,
            user: userId,
            text: text || null,
            audioUrl: audioUrl || null
        })

        await newComment.save();
        await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 }})

        res.status(201).json({
            message: "Commemt is added ",
            newComment
        });
    } catch (error) {
        console.error(error, "error creating comment");
        res.status(500).json({ message: 'Internal server error', error: error.message});
        
    }
});

router.get("/:comment", protectRoute, async (rep, res) =>{
    try {
        const { postId } = rep.params

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