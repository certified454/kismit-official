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
        if(!query) {
        return res.status({message: 'Missing Search query'})
        };

        const userSearch = await User.find({ username: { $regex: query, $option: 'i' } });
        if(userSearch.length === 0){
            return res.status(200).json({message: 'No user match the search'})
        }
        console.log({message: "search fetched"})
        res.status(200).json(userSearch)
    } catch (error) {
        console.error(error, "Internal server error")
        res.status(500).json('Failed', "Failde to Search")
    }
})
export default router;