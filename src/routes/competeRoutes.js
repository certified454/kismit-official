import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';
import Compete from '../modules/compete.js';
import User from '../modules/user.js';

const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {

    // get the user making the request to the endpoint
    const currentUserObjectId = req.user._id;
    // get the user being challenged from the request params
    const { targetedUserObjectId } = req.body;
    const { name } = req.body;

    //set the current user as the creator of the compete and the targeted user as the challenged user
    if (targetedUserObjectId === currentUserObjectId.toString()) {
        console.log('You cannot challenge yourself');
        return res.status(400).json({ error: 'You cannot challenge yourself' });
    }
    try {
        const targetUser = await User.findById(targetedUserObjectId);
        const creator = await User.findById(currentUserObjectId);

        if (!targetUser || !creator) {
            console.log('Target user or creator not found');
            return res.status(404).json({ error: 'User not found' });
        };

        const newCompete = new Compete({
            creator: currentUserObjectId,
            targetedUser: targetedUserObjectId,
            name: name || `Compete between ${creator.username} and ${targetUser.username}`,
        });

        await newCompete.save();
        console.log('Compete created successfully:', newCompete);
        res.status(201).json({ message: 'Compete created successfully', compete: newCompete });
    } catch (error) {
        console.error('Error creating compete:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;