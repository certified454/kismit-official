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

    await Post.findByIdAndUpdate(postId, { $inc: { likesCount: 1 } });
    await newLike.save();

    // Emit new like event
    req.app.get('io').emit('new like created', {postId});

    return res.status(201).json(newLike);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "You've already liked this post." });
    }
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

router.delete('/post/:postId/like', protectRoute, async (req, res) => {
  const postId = req.params.postId;
  const userId = req.user._id;

  try {
    const like = await Like.findOneAndDelete({ post: postId, user: userId });
    if (!like) {
      return res.status(404).json({ message: "Like not found" });
    }

    await Post.findByIdAndUpdate(postId, { $inc: { likesCount: -1 } });

    // Emit like deletion event
    req.app.get('io').emit('like deleted', {postId});

    return res.status(200).json({ message: 'Like removed successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
})
export default router;