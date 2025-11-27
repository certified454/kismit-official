import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import Analysis from '../modules/analysis.js';
import News from '../modules/news.js';
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

    const liked = post.like.includes(userId);

    let update;
    let message;

    if (liked) {
      update = {
        $pull: { like: userId },
        $inc: { likesCount: -1 } 
      }
      message = "You have unliked this post";
    } else {
     update = {
      $addToSet: { like: userId },
      $inc: { likesCount: 1 }
     }   
       message = "You have liked this post";  
    }
    const updatedPost = await Post.findByIdAndUpdate(postId, update, {new: true})
    // emit the likes event
    req.app.get('io').emit('new like created', {
      postId: post._id,
      userId: userId,
      liked: !liked
    });
    res.status(200).json({
      message,
      post: updatedPost,
      success: true
    }); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", success: false });
  }
}),

router.post('/analysis/:analysisId/like', protectRoute, async (req, res) => {
  const analysisId = req.params.analysisId;
  const userId = req.user._id;

  try {
    const analysis = await Analysis.findById(analysisId);

    if (!analysis) {
      console.log("Analysis not found")
      return res.status(400).json({ message: "Post not found" });
    };

    //instead of retuning already liked post, we want to remove the user from the likes arrary
    const liked = analysis.like.includes(userId);

    let update;
    let message;

    if (liked) {
      update = {
        $pull: { like: userId },
        $inc: { likesCount: -1 } 
      }
      message = "You have unliked this Video";
    } else {
     update = {
      $addToSet: { like: userId },
      $inc: { likesCount: 1 }
     }   
       message = "You have liked this Video";  
    }
    const updatedAnalysis= await Analysis.findByIdAndUpdate(analysisId, update, {new: true})
    // emit the likes event
    req.app.get('io').emit('new like created', {
      analysisId: analysis._id,
      userId: userId,
      liked: !liked
    });
    console.log("Like event emitted");
    res.status(200).json({
      message,
      analysis: updatedAnalysis,
      success: true
    }); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", success: false });
  }
})

router.post('/news/:newsId/like', protectRoute, async (req, res) => {
  const newsId = req.params.id;
  const userId = req.user._id;

  try {
    const newsArticle = await News.findById(newsId);

    if (!newsArticle) {
      return res.status(400).json({ message: "News article not found" });
    };
    const liked = newsArticle.likedBy.includes(userId);
   
    let update;
    let message;

    if (liked) {
      update = {
        $pull: { like: userId },
        $inc: { likesCount: -1 } 
      }
      message = "You have unliked this post";
    } else {
     update = {
      $addToSet: { like: userId },
      $inc: { likesCount: 1 }
     }   
       message = "You have liked this post";  
    }
    const updatedNews = await News.findByIdAndUpdate(newsId, update, {new: true})
    // emit the likes event
    req.app.get('io').emit('new like created', {
      newsId: newsArticle._id,
      userId: userId,
      liked: !liked
    });
    console.log("Like event emitted");
    res.status(200).json({
      message,
      newsArticle: updatedNews,
      success: true
    }); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", success: false });
  }
});
export default router;