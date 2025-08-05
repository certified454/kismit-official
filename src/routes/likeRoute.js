import express from 'express';

import protectRoute from '../middleware/auth.middleware';
import Post from '../modules/post';
import Like from '../modules/like';
import mongoose from 'mongoose';
import User from '../modules/user';

const router = express.Router();

router.post('/post/:postId', protectRoute, async (req, res) => {
    const postId = req.params.postId;
    const { like } = req.body;
    try {
        const post = await Post.findById(postId)
        if(!post) {
            console.log("Post not found with the ids")
            return res.status(404).json({message: "Post not found with the id"})
        }

        const newLike = new Like({
            like: like,
            post: postId,
            user: res.user._id
        })

        if (error.code === 11000) {
            console.log("You've already liked this post.")
            return res.status(409).json({ message: "You've already liked this post." });
        }

        await newLike.save();
        console.log("like added");
        await Post.findByIdAndUpdate(postId, {$inc: {likesCount: 1}})


        return res.status(201).json(newLike)
    } catch (error) {
         console.error(error, "error liking");
        return res.status(500).json({ message: 'Internal server error', error: error.message});
    }
});

export default router;