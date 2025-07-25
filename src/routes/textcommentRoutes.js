import express from 'express';

import protectRoute from '../middleware/auth.middleware.js';
import Post from '../modules/post.js';
import TextComment from '../modules/textcomment.js';
import user from "../modules/user.js";

const router = express.Router();

router.post("/textcomment", protectRoute, async (req, res) => {
    try {
        const { text } = req.body;

        if ( !text ) return res.status(400).json({ message: "Text field is empty"})

        const newTextComment = new TextComment({
            text: text.trim(),
            post: req.body.postId,
            user: req.user._id
        })

        await newTextComment.save();
        res.status(201).json(newTextComment);

    } catch (error) {
        console.error(error, "error creating text comment");
        res.status(500).json({ message: "error creating text comment" });
        
    }
});

router.get("/textcommet/:postId", protectRoute, async (req, res) => {
    try {
        const textComment = await TextComment.find({ post: req.params.postId}).sort({ createdAt: -1}).populate("user", "username profilePicture")

        if (!textComment || textComment.length === 0) {
            return res.status(404).json({ message: "Comment on this post will be display here"})
        }

        res.status(200).json(textComment)
    } catch (error) {
        console.error(error, "error fetching text comments");
        res.status(500).json({ message: "error fetching text comments" });
        
    }
});

router.get("/textcomments", protectRoute, async (req, res) => {
    try {
        const page = req.query.page || 1;
        const limit = req.query.limit || 10;
        const skip = (page - 1) * limit;

        const textComments = await TextComment.find()
        .sort({ createdAt: -1})
        .skip(skip)
        .limit(limit)
        .populate("user", "username profilePicture")

        const totalTextComments = await TextComment.countDocuments();
        if (!textComments) return res.statsu(404).json({ message: "No comment yet on this post"})
        
        res.send({
            textComments,
            totalTextComments,
            currentPage: page,
            totalPages: Math.ceil(totalTextComments / limit),
        })
    } catch (error) {
        console.error(error, "error fetching comments");
        res.status(500).json({ message: "error fetching comments" }); 
    }
}),

router.delete("/textcomment/:id", protectRoute, async (req, res) => {
    try {
        const comment = await TextComment.findById(req.params.id);

        if (!comment)  return res.stat(404).json({ messgae: " Comment not found"});

        if (comment.user.toSting() !== req.user._id.toSTring()) return res.statu(404).json({ message: " authorized " });

        await comment.deleteOne();
        res.json({ messgae: "Comment is deleted"});
    } catch (error) {
        console.error(error, "error deleting comment")
        res.status(500).json({message: "error deleting comment"})
    }
})

export default router;