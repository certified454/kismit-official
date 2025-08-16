import express from 'express';

import Post from "../modules/post.js"
import Comment from '../modules/comment.js';
import cloudinary from '../lib/cloudinary.js';
import protectRoute from '../middleware/auth.middleware.js';

const router = express.Router();

router.post("/register", protectRoute,  async (req, res) => {
    try { 
        const { caption, image } = req.body;

        if ( !caption || !image ) {
            return res.status(400).json({message: "All fields are required"})
        }
        
        //upload image to cloudinary
        const uploadResponse = await cloudinary.uploader.upload(image);
        const imageUrl = uploadResponse.secure_url;

        //save to data base
        const newPost = new Post({
            caption,
            image: imageUrl,
            user: req.user._id
        })

        await newPost.save()
        // emit new post event
        const populatedPost =await Post.findById(newPost._id).populate('user', 'username profilePicture');
        req.app.get('io').emit('new post created', {
            _id: populatedPost._id,
            user: {
                id: populatedPost.user._id,
                username: populatedPost.user.username,
                profilePicture: populatedPost.user.profilePicture
            },
            caption: populatedPost.caption,
            image: populatedPost.image,
            commentsCount: populatedPost.commentsCount,
            likesCount: populatedPost.likesCount,
            createdAt: populatedPost.createdAt
        })
        console.log("Post save and emitted successfully");
        res.status(201).json(populatedPost);

    } catch (error) {
        console.error(error, "error registering post");
        res.status(500).json({ message: "error registering post" });
    }
});

router.get("/", protectRoute, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 7;
        const skip = (page - 1) * limit;

        const posts = await Post.aggregate([
            {
                $sort: { createdAt: -1 }
            },
            {
                $skip: skip 
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
                $lookup: {
                    from: 'comments',
                    localField: '_id',
                    foreignField: 'post',
                    as: 'comments'
                }
            },
            {
                $addFields: {
                    commentsCount: { $size: '$comments' },
                    likesCount: { $size: { $ifNull: ['$like', []] } },
                    liked: {
                        $in: [req.user._id, { $ifNull: ['$like', []] } ]
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    caption: 1,
                    image: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    user: {
                        _id: '$user._id',
                        username: '$user.username',
                        profilePicture: '$user.profilePicture'
                    },
                    commentsCount: 1,
                    likesCount: 1
                }
            }
        ]);

        console.log("Posts fetched successfully");

        const totalPosts = await Post.countDocuments();
        
        res.send({
            posts,
            currentPage: page,
            totalPosts,
            totalPages: Math.ceil(totalPosts / limit),
        })
    } catch (error) {
        console.error(error, "error fetching posts");
        res.status(500).json({ message: "error fetching posts" });
    }
});

router.get("/:postId", protectRoute, async (req, res) => {
    const postId = req.params.postId
    try {
        const post = await Post.findById(postId)
        .populate('user', 'username profilePicture')
        .populate('comment', 'text audioUrl')
        
        const liked = post.like.some((id) => id.toString() === req.user._id.toString()) 

        res.send({ post, liked });
    } catch (error) {
        console.error(error, "error fetching user posts");
        res.status(500).json({ message: "error fetching user posts" });
    }
})

router.delete("/:id", protectRoute, async (req, res) => {
    try {
        const postId = req.params.id

        const post = await Post.findById(postId);
        
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.user.toString() !== req.user._id.toString())
            return res.status(401).json({ message: "Unauthorized" })

        await post.deleteOne();
        res.json({ message: "Post deleyed Successfully" })
        
    } catch (error) {
        console.error(error, "error deleting post");
        res.status(500).json({ message: "error deleting post" });
    }
});

export default router;