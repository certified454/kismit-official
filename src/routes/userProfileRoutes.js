import express from "express";
import mongoose from "mongoose";

import User from '../modules/user.js';
import protectRoute from "../middleware/auth.middleware.js";
import { triggerAsyncId } from "async_hooks";

const router = express.Router();
const TWENTY_DAYS_IN_MS = 20 * 24 *  60 * 60 * 1000;
router.get('/:userId', protectRoute, async (req, res) => {
    const userId = req.params.userId;
    const currentUserObjectId = req.user._id;
    try {
        const user = await User.findById(userId).select('-password -verificationCode -verificationCodeExpires -dateOfBirth -editProfile');
        if (!user)
            return res.status(404).json({ message: "User not found" });

        const currentUser = await User.findById(currentUserObjectId);
        const followingUser = currentUser.following.some(
            (id) => id.toString() === userId.toString()
        );
        res.send({ user, followingUser, success: true });
    } catch (error) {
       console.error(error, "Error fetching user profile");
       res.status(500).json({ message: "Internal server error", success: false });
    }
})

//Update a user route
router.put('/:userId', protectRoute, async (req, res) => {
    const userId = req.params.userId;
    const {username, email, profilePicture, bio, fullName, location, gender, hobbies} = req.body;
    //Lets get the previous data from the user input
    try {
         const user = await User.findById(userId).select('-password -verificationCode -verificationCodeExpires -dateOfBirth -editProfile');
        if (!user) {
            return res.status(404).json({message: 'User not found'})
        }

        const now = Date.now();
        if (username && username !== user.username) {
            const lastChanged = user.usernameLastChanged?.getTime() || 0;
            const timeSinceChanged = Date.now() - lastChanged;
            if (timeSinceChanged < TWENTY_DAYS_IN_MS) {
                console.log("Username can only be changed once every 20 days");
                res.status(404).json({error: "Username can only be changed once every 20 days"})
            } 
            user.username = username ?? user.username;
            user.usernameLastChanged = Date.now();
        }
        user.email = email ?? user.email;
        user.profilePicture = profilePicture ?? user.profilePicture;
        user.bio = bio ?? user.bio;
        user.fullName = fullName ?? user.fullName;
        user.location = location ?? user.location;
        user.gender = gender ?? user.gender;
        user.hobbies = hobbies ?? user.hobbies;
    
        await user.save();
        res.status(200).json({message: 'User updated successfully', user, success: true});        
    } catch (error) {
        console.error(error, "failed updated user");
       res.status(500).json({ message: "Internal server error", success: false });
    }
})

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

        let message;

        if(followed){
            await User.findByIdAndUpdate(currentUserObjectId, {
                $pull: { following: targetUserObjectId },
                $inc: { followingCount: -1 }
            }) 
            await User.findByIdAndUpdate(targetUserObjectId, {
                $pull: { followers: currentUserObjectId },
                $inc: { followersCount: -1 }
            }) 
            message = 'You Unfollowed this user '
        } else {
            await User.findByIdAndUpdate(currentUserObjectId, {
                $addToSet: { following: targetUserObjectId },
                $inc: { followingCount: 1 }
            }) 
            await User.findByIdAndUpdate(targetUserObjectId, {
                $addToSet: { followers: currentUserObjectId },
                $inc: { followersCount: 1 }
            }) 
            message = 'You followed this user'
        }
        //update the targeted user on a newfollower
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