import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import mongoose from 'mongoose';
import User from '../modules/user.js';

const router = express.Router();

router.post('/post/:postId/like', protectRoute, async (req, res) => {
  const postId = req.params.postId;
  const userId = req.user._id;

  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(400).json({ message: "Post not found" });
    };

    //instead of retuning already liked post, we want to remove the user from the likes arrary
    const liked = post.like.includes(userId);

    if (liked) {
      post.like.pull(userId);
      post.likesCount = Math.max(0, post.likesCount - 1);
      await post.save();
      return res.status(200).json({ message: "You have unliked this post" });
    } else {
      post.like.push(userId);
      post.likesCount += 1;
      await post.save();
      return res.status(200).json({ message: "You have liked this post" });
    }
    // emit the likes event
    req.app.get('io').emit('new like created', {
      postId: post._id,
      userId: userId,
      liked: !liked
    });
    res.status(200).json({
      message: liked ? "You have unliked this post" : "You have liked this post",
      post,
      success: true
    }); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", success: false });
  }
})
export default router;