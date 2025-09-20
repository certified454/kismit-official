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
            return res.status(400).json({ message: 'Missing Search query' });
        }

        const userSearch = await User.find({ username: { $regex: query, $options: 'i' } });
        const tagSearch = await Post.find({ 'tags.name': { $regex: query, $options: 'i' } });

        // Always return both arrays
        res.status(200).json({ users: userSearch, tags: tagSearch });
    } catch (error) {
        console.error(error, "Internal server error");
        res.status(500).json({ message: "Failed to Search" });
    }
});
export default router;