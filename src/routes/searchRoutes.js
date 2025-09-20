import mongoose from "mongoose";
import User from "../modules/user.js";
import Post from "../modules/post.js";
import Analysis from "../modules/analysis.js";
import express from "express";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

router.get('/search', protectRoute, async (req, res) => {
    const query = req.query.q;

    try {
        if (!query) {
            return res.status({ message: 'Missing Search query' })
        };

        const userSearch = await User.find({ username: { $regex: query, $options: 'i' }});
        if (userSearch.length === 0) {
            console.log({ message: 'No user match the search' })
            return res.status(200).json({ message: 'No user match the search' })
        }
        const tagSearch = await Post.find({ 'tags.name': { $regex: query, $options: 'i' }})
        if (tagSearch.length === 0) {
            console.log({ message: 'No tag match the search' })
            return res.status(200).json({ message: 'No tag match the search' })
        }
        console.log({ message: "search fetched" })
        res.status(200).json({ users: userSearch, tags: tagSearch })
    } catch (error) {
        console.error(error, "Internal server error")
        res.status(500).json({ message: "Failed to Search" })
    }
})
export default router;