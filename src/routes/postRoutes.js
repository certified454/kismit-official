import express from 'express';

import Post from "../modules/post.js"
import Comment from '../modules/comment.js';
import Tag from '../modules/tag.js';
import cloudinary from '../lib/cloudinary.js';
import protectRoute from '../middleware/auth.middleware.js';
import User from '../modules/user.js';

const router = express.Router();

router.post("/register", protectRoute,  async (req, res) => {
    try { 
        const { caption, image, music } = req.body;

        //extract tags and mentions from caption
        const tagRegrex = /#(\w+)/g;
        const mentionRegrex = /@(\w+)/g;

        const extractedTags = caption.match(tagRegrex);
        const extractedMentions  = caption.match(mentionRegrex);

        const tags = extractedTags ? extractedTags.map(tag => tag.substring(1)) : [];
        const mentions = extractedMentions ? extractedMentions.map(mention => mention.substring(1)) : [];

        if ( !caption || !image ) {
            return res.status(400).json({message: "All fields are required"})
        }
        const uploadResponse = await cloudinary.uploader.upload(image);
        const imageUrl = uploadResponse.secure_url;

        const mentionedUserIds = [];
        for (const username of mentions) {
            const user = await User.findOne({username: new RegExp(`^${username}$`, 'i')});
            if (user) {
                mentionedUserIds.push(user._id);
            }
        };

        const newPost = new Post({
            caption,
            image: imageUrl,
            user: req.user._id,
            tags,
            mentions: mentionedUserIds,
            music
        })
        // create tag documents if they don't exist
        for (const tagName of tags) {
            let tag = await Tag.findOne({name: tagName});
            if (!tag) {
                tag = new Tag({name: tagName, posts: [newPost._id]})
                await tag.save();
                console.log(`Tag ${tagName} created and associated with post ${newPost._id}`);
            } else {
                tag.posts.push(newPost._id);
                await tag.save();
                console.log(`Post ${newPost._id} associated with existing tag ${tagName}`);
            }
        }
      
        await newPost.save()
        // emit new post event
        const populatedPost = await Post.findById(newPost._id).populate('user', 'username profilePicture');
        req.app.get('io').emit('new post created', {
            _id: populatedPost._id,
            user: {
                id: populatedPost.user._id,
                username: populatedPost.user.username,
                profilePicture: populatedPost.user.profilePicture
            },
            caption: populatedPost.caption,
            image: populatedPost.image,
            tags: populatedPost.tags,
            mentions: populatedPost.mentions,
            music: populatedPost.music,
            commentsCount: populatedPost.commentsCount,
            likesCount: populatedPost.likesCount,
            createdAt: populatedPost.createdAt
        })
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
                $lookup: {
                    from: 'tags',
                    localField: 'tags',
                    foreignField: 'name',
                    as: 'tags'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'mentions',
                    foreignField: '_id',
                    as: 'mentions'
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
                    tags: { name: 1 },
                    mentions: {_id: 1, username: 1, profilePicture: 1 },
                    music: 1,
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
        const totalPosts = await Post.countDocuments();
        res.send({
            posts,
            currentPage: page,
            totalPosts,
            totalPages: Math.ceil(totalPosts / limit),
        })
    } catch (error) {
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

router.put('/:postId', protectRoute, async (req, res) => {
    const postId = req.params.postId;
    const { caption } = req.body;
    try {
        const post = await Post.findById(postId)
        if (!post) {
            return res.status(404).json({message: 'No post found'})
        };
        if (post.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({message: 'Unauthorized'})
        };
        if (!caption) {
            return res.status(404).json({message: 'Caption not modified', post})
        };
        if(caption === post.caption) {
            return res.status(400).json({message: 'No changes made to caption', post})
        };
        post.caption = caption;

        const tagRegrex = /#(\w+)/g;
        const mentionRegrex = /@(\w+)/g;

        const extractedTags = caption.match(tagRegrex);
        const extractedMentions  = caption.match(mentionRegrex);

        const tags = extractedTags ? extractedTags.map(tag => tag.substring(1)) : [];
        const mentions = extractedMentions ? extractedMentions.map(mention => mention.substring(1)) : [];
        
        const mentionedUserIds = [];
        for (const username of mentions) {
            const user = await User.findOne({username: new RegExp(`^${username}$`, 'i')});
            if(user) {
                mentionedUserIds.push(user._id)
            }
        };
      
        post.mentions = mentionedUserIds.length > 0 ? mentionedUserIds : [];
        // create tag documents if they don't exist
        for (const tagName of tags) {
            let tag = await Tag.findOne({name: tagName})
            if(!tag) {
                tag = new Tag({name: tagName, posts: [postId] })
                await tag.save()
            } else if (!tag.posts.includes(postId)) {
                tag.posts.push(postId)
                await tag.save()
            }
        };
        post.tags = tags;
        await post.save();
        req.app.get('io').emit('editedPost', {postId, updatedFields: {caption, tags, mentions: post.mentions}});
        res.status(200).json({message: 'Post updated successfully', post});
    } catch (error) {
        console.error(error, "error updating post");
        res.status(500).json({ message: "error updating post" });
    }
})
router.delete("/:id", protectRoute, async (req, res) => {
    try {
        const postId = req.params.id

        const post = await Post.findById(postId);
        
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.user.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: "Unauthorized" })
        }

        await post.deleteOne();
        res.json({ message: "Post deleyed Successfully" })
        
    } catch (error) {
        console.error(error, "error deleting post");
        res.status(500).json({ message: "error deleting post" });
    }
});

export default router;''