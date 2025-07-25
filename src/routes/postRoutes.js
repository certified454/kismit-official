import express from 'express';

import Post from "../modules/post.js"
import cloudinary from '../lib/cloudinary.js';
import protectRoute from '../middleware/auth.middleware.js';
import TextComment from '../modules/textcomment.js';

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
        res.status(201).json(newPost)

    } catch (error) {
        console.error(error, "error registering post");
        res.status(500).json({ message: "error registering post" });
    }
});

router.get("/", protectRoute, async (req, res) => {
    try {
        const page = req.query.page || 1;
        const limit = req.query.limit || 10;
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
                    from: 'textcomments',
                    localField: '_id',
                    foreignField: 'post',
                    as: 'comments_data',
                }
            },
            {
                $addFields: {
                    commentCount: { $size: '$comments_data' }
                }
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
                    comments_data: 0,
                    _id: 1,
                    caption: 1,
                    image: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    user: {
                        _id: 1,
                        username: 1,
                        profilePicture: 1
                    },
                    commentCount: 1
                }
            }
        ]);

        console.log("Posts fetched successfully");

        const totalPosts = await Post.countDocuments();
        if (!posts) {
            return res.status(404).json({ message: "No posts found" });
        }
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

router.get("/user", protectRoute, async (req, res) => {
    try {
        const posts = await Post.find({ user: req.user._id }).sort({ createdAt: -1});
        res.json(posts);
    } catch (error) {
        console.error(error, "error fetching user posts");
        res.status(500).json({ message: "error fetching user posts" });
    }
})

router.delete("/:id", protectRoute, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.user.toString() !== req.user._id.toString())
            return res.status(401).json({ message: "Unauthorized" })

        //delete the image from cloudinary
        if (post.file && post.file.includes("cloudinary")) {
            try {
                const publicId = post.file.split("/").pop().split(".")[0];
                await cloudinary.uploader.destroy(publicId);
            } catch (error) {
                console.error("Error deleting image from Cloudinary", error);
                return res.status(500).json({ message: "Error deleting image from Cloudinary" });
                
            }
        } 

        await post.deletOne();
        res.json({ message: "Post deleyed Successfully" })
    } catch (error) {
        console.error(error, "error deleting post");
        res.status(500).json({ message: "error deleting post" });
    }
});

export default router;