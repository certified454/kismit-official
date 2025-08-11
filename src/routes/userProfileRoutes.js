import express from "express";
import mongoose from "mongoose";

import User from '../modules/user.js';
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

router.get('/:userId', protectRoute, async (req, res) => {
    // If userId param is present, fetch that user's profile
    // Otherwise, fetch the currently authenticated user's profile
    const userId = req.params.userId || req.user._id;

    try {
        const user = await User.findById(userId).select('-password -verificationCode -dateOfBirth -phoneNumber');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json({ success: true, user });
    } catch (error) {
        console.error(error, "Error fetching user profile");
        res.status(500).json({ message: "Internal server error", success: false });
    }
});

router.post('/:userId/follow', protectRoute, async (req, res) => {
    const targetUserObjectId = req.params.userId;
    const currentUserObjectId = req.user._id

    if(targetUserObjectId === currentUserObjectId.toString()) {
        console.log('You cannot follow yourself');
        return res.status(400).json({ message: "You cannot follow yourself" });
    }

    try {
        const targetUser = await User.findById(targetUserObjectId);
        const currentUser = await User.findById(currentUserObjectId)

        if(!targetUser  || !currentUser) {
            console.log('User not found')
            return res.status(404).json({ message: "User not found" });
        };

        const followed = currentUser.following.includes(targetUserObjectId);

        let update;
        let message;

        if(followed){
            await User.findByIdAndUpdate(currentUserObjectId, {
                $pull: { following: targetUserObjectId },
                $inc: { followersCount: -1 }
            }) 
            await User.findByIdAndUpdate(targetUserObjectId, {
                $pull: { followers: currentUserObjectId },
                $inc: { followersCount: -1 }
            }) 
            message = 'You Unfollowed this user '
        } else {
            await User.findByIdAndUpdate(currentUserObjectId, {
                $addToSet: { following: targetUserObjectId },
                $inc: { followersCount: 1 }
            }) 
            await User.findByIdAndUpdate(targetUserObjectId, {
                $addToSet: { followers: currentUserObjectId },
                $inc: { followersCount: 1 }
            }) 
            message = 'You followed this user'
        }
        const updatedUser = await User.findByIdAndUpdate(targetUserObjectId)
        req.app.get('io').emit('new follower', {
            userId: targetUserObjectId,
            followerId: currentUserObjectId,
            followed: !followed
        });

        res.status(200).json({
            message,
            user: updatedUser,
            success: true
        })
    } catch (error) {
        console.error(error, 'Failed')
        res.status(500).json({
            message: 'Internal server error',
            success: false
        })
    }
})

export default router;