import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';
import Compete from '../modules/compete.js';
import User from '../modules/user.js';

const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {
    const currentUserObjectId = req.user._id;

    const { targetedUserObjectId } = req.body;
    const { description, status, team } = req.body;

    //set the current user as the creator of the compete and the targeted user as the challenged user
    if (targetedUserObjectId === currentUserObjectId.toString()) {
        console.log('You cannot challenge yourself');
        return res.status(400).json({ error: 'You cannot challenge yourself' });
    };

    try {
        const targetUser = await User.findById(targetedUserObjectId);
        const creator = await User.findById(currentUserObjectId);

        if (!targetUser || !creator) {
            console.log('Target user or creator not found');
            return res.status(404).json({ message: 'User not found' });
        };

        const existingCompetition = await Compete.findOne({
            $or: [
                { creator: currentUserObjectId, targetedUser: targetedUserObjectId },
                { creator: targetedUserObjectId, targetedUser: currentUserObjectId }
            ]
        });
        if (existingCompetition) {
            console.log('A competition between these users already exists');
            return res.status(400).json({ message: 'This competition already exists between you and the competing user' });
        }
        
       if (targetUser.expoPushToken) {
            try {
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: targetUser.expoPushToken,
                        title: 'New challenge for a compete!',
                        image: creator.profilePicture,
                        body: `🔥 ${creator.username} has challenged you to a compete! Accept or decline.`,
                        data: {
                            challengerId: currentUserObjectId,
                            description
                        },
                        badge: 1
                    })
                });
            } catch (error) {
                console.error('Error sending push notification:', error);
            }
        }
        res.status(200).json({ message: 'Challenge sent. Awaiting response.' });

    } catch (error) {
        console.error('Error creating compete:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ...existing code...
router.post('/respond', protectRoute, async (req, res) => {
    const targetedUserId = req.user._id;
    const { challengerId, description, accepted, team } = req.body;

    if (!accepted) {
        return res.status(200).json({ message: 'Challenge declined.' });
    }

    try {
        const creator = await User.findById(challengerId);
        const targetUser = await User.findById(targetedUserId);

        if (!creator || !targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Save to DB only if accepted and team is provided
        const newCompete = new Compete({
            creator: challengerId,
            targetedUser: targetedUserId,
            description: description || `Compete between ${creator.userdescription} and ${targetUser.userdescription}`,
            status: 'accepted',
            team // targeted user's team
        });

        await newCompete.save();
        res.status(201).json({ message: 'Compete accepted and created.', compete: newCompete });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ...existing code...

export default router;