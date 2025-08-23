import express from "express";
import mongoose from "mongoose";

import User from '../modules/user.js';
import Post from '../modules/post.js';
import protectRoute from "../middleware/auth.middleware.js";
import Analysis from "../modules/analysis.js";

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

router.put('/:userId', protectRoute, async (req, res) => {
    const userId = req.params.userId;
    const {username, email, profilePicture, bio, fullName, location, gender, hobbies, phone} = req.body;

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
                return res.status(404).json({error: "Username can only be changed once every 20 days", success: false})
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
        user.phone = phone ?? user.phone;
    
        await user.save();
        req.app.get('io').emit('userProfileUpdated', {
            userId,
            updatedFields: { username, email, profilePicture, bio, fullName, location, gender, hobbies, phone }
        });
        res.status(200).json({message: 'User updated successfully', user, success: true});        
    } catch (error) {
        console.error(error, "failed updated user");
       res.status(500).json({ message: "Internal server error", success: false });
    }
})

router.get('/:userId/posts', protectRoute, async (req, res) => {
    try {
        const userId = req.params.userId;
        const posts = await Post.find({ user: userId}).sort({ createdAt: -1});
        res.status(200).json({ posts, success: true });
        console.log("User posts fetched successfully");
    } catch (error) {
        console.error(error, "Error fetching user posts");
        res.status(500).json({ message: "Internal server error", success: false });
    }
})
router.get('/:userId/analysis', protectRoute, async ( req, res) =>{
    try{
        const userId = req.params.userId;
        const analysis = await Analysis.find({ user: userId}).sort({ createdAt: -1});
        res.status(200).json({message: 'User analysis fetched', success: true, analysis});
        console.log({message: 'user analysis fetched'})
    } catch (error) {
        console.error(error, "Internal server error ")
        res.status(500).json({message: 'Internal sever error'})
    }
})

//get expoPushToken and save it to the database
router.post('/:userId/expoPushToken', protectRoute, async (req, res) => {
  const userId = req.params.userId;
  const { expoPushToken } = req.body;

  if (!expoPushToken) {
    console.log('expoPushToken is required');
    return res.status(400).json({ message: 'expoPushToken is required' });
  }

  try {
    const user = await User.findById(userId);
    // console.log('Found user:', user);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    //get the expoPushToken before saving to the database
    user.expoPushToken = expoPushToken;
    //check if the expoPushToken is not am empty string
    if(expoPushToken === "") {
        console.log('Expo push token is empty')
        return res.status(400).json({ message: 'expoPushToken cannot be an empty string' })
    } else {
        await user.save();
    }
    res.status(200).json({ message: 'expoPushToken saved successfully', success: true });
  } catch (error) {
    console.error('Error saving expoPushToken:', error);
    res.status(500).json({ message: 'Internal server error', success: false });
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
        // send a push notification to the targeted user
        if(targetUser.expoPushToken) {
            try {
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        to: targetUser.expoPushToken,
                        title:  'New Follower',
                        body: `🎉 ${currentUser.username} has followed you`,
                        badge: unreadCount
                    })
                })
                console.log('Push notification sent successfully');
            } catch (error) {
                console.error('Error sending push notification:', error);
            }
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

router.get('/:userId/followers', protectRoute, async (req, res) => {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    try {
        if(!mongoose.Types.ObjectId.isValid(userId)) {
            console.log('No follower')
            return res.status(400).json({message: 'follow this user'})
        }
        const followerObjectId = new mongoose.Types.ObjectId(userId)
        const followers = await User.aggregate([
            {
                $match: { _id: followerObjectId}
            },
            {
                $project: {
                    followers: { $slice: ['$followers', skip, limit] }
                },
            }, 
            {
                $unwind: '$followers'
            }, 
            {
                $lookup: {
                    from: 'users',
                    localField: 'followers',
                    foreignField: '_id',
                    as: 'followersList'
                }
            },
            {
                $unwind: '$followersList'
            },
            {
                $project: {
                    _id: '$followersList._id',
                    username: '$followersList.username',
                    profilePicture: '$followersList.profilePicture'
                }
            }
        ])
        res.status(200).json({followers, success: true})
        console.log(followers, "follower fetched")
    } catch (error) {
        console.error('Error fetching followers:', error);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
})
router.get('/:userId/following', protectRoute, async (req, res) => {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    try {
        if(!mongoose.Types.ObjectId.isValid(userId)) {
            console.log('no user found')
            return res.status(400).json({message: 'no user found'})
        }
        const followingObjectId = new mongoose.Types.ObjectId(userId)
        const following = await User.aggregate([
            {
                $match: { _id: followingObjectId}
            },
            {
                $project: {
                    following: { $slice: ['$following', skip, limit] }
                },
            }, 
            {
                $unwind: '$following'
            }, 
            {
                $lookup: {
                    from: 'users',
                    localField: 'following',
                    foreignField: '_id',
                    as: 'followingList'
                }
            },
            {
                $unwind: '$followingList'
            },
            {
                $project: {
                    _id: '$followingList._id',
                    username: '$followingList.username',
                    profilePicture: '$followingList.profilePicture'
                }
            }
        ])
        res.status(200).json({following, success: true})
        console.log(following, "following users are fetched")
    } catch (error) {
        console.error('Error fetching followed users:', error);
        res.status(500).json({ message: 'Internal server error', success: false });
    }
})

export default router;