import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import Comment from '../modules/comment.js';
import User from '../modules/user.js';

const router = express.Router();

router.post("/", protectRoute, async (req, res) => {
    try {
        const { postId, text, audioUrl, type } = req.body;

        if (!postId || !type ) return res.status(400).json({ message: "Comment type must be provided in other to make a comment"})
        
        if (type === 'text' && !text ) return res.status(400).json({ message: "Text input cannot be empty"})
        if (type === 'audio' && !audioUrl ) return res.status(400).json({ message: "You must add a record to comment"})

        const newComment = new Comment({
            post: postId,
            user: req.user._id,
            type,
            text: type === 'text' ? text : undefined,
            audioUrl: type === 'audio' ? audioUrl : undefined,
        })

        await newComment.save();
        await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 }})

        res.status(201).json({
            message: "Commemt is added ",
            newComment
        });
    } catch (error) {
        console.error(error, "error creating text comment");
        res.status(500).json({ message: "error creating text comment" });
        
    }
});

// router.get("/comment/:postId", protectRoute, async (req, res) => {
//     try {
//         const comment = await Comment.find({ post: req.postId }).sort({ createdAt: -1}).populate("user", "username profilePicture")

//         if (!comment || comment.length === 0) {
//             return res.status(404).json({ message: "No comment yet... Be the first to comment on this post"})
//         }
//     } catch (error) {
//         console.error(error, "error fetching text comments");
//         res.status(500).json({ message: "error fetching text comments" });
        
//     }
// });

// router.get("/text", protectRoute, async (req, res) => {
//     try {
//         const page = req.query.page || 1;
//         const limit = req.query.limit || 10;
//         const skip = (page - 1) * limit;

//         const textComments = await TextComment.find()
//         .sort({ createdAt: -1})
//         .skip(skip)
//         .limit(limit)
//         .populate("user", "username profilePicture")

//         const totalTextComments = await TextComment.countDocuments();
//         if (!textComments) return res.statsu(404).json({ message: "No comment yet on this post"})
        
//         res.send({
//             textComments,
//             totalTextComments,
//             currentPage: page,
//             totalPages: Math.ceil(totalTextComments / limit),
//         })
//     } catch (error) {
//         console.error(error, "error fetching comments");
//         res.status(500).json({ message: "error fetching comments" }); 
//     }
// }),

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