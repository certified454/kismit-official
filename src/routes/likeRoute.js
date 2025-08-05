import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import Like from '../modules/like.js';
import mongoose from 'mongoose';
import User from '../modules/user.js';

const router = express.Router();

router.post('/post/:postId/like', protectRoute, async (req, res) => {
  const postId = req.params.postId;
  const userId = req.user._id;

  try {
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const newLike = new Like({
      post: postId,
      user: userId,
      like: 1
    });

    await newLike.save();
    await Post.findByIdAndUpdate(postId, { $inc: { likesCount: 1 } });

    return res.status(201).json(newLike);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "You've already liked this post." });
    }
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

export default router;