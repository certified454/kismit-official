import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';
import Compete from '../modules/compete.js';
import User from '../modules/user.js';
import userProfileRoute from './routes/userProfileRoutes.js';
import e from 'express';

const router = express.Router();

router.post('/register', protectRoute, async (req, res) => {
    const currentUserObjectId = req.user._id;

    const { targetedUserObjectId } = req.body;
    const { description, status, team, teamCounts } = req.body;

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
        };
        // send notification to the targeted user about the new compete challenge usining expo notifications
        if (targetUser.expoPushToken) { 
            try {
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        to: targetUser.expoPushToken,
                        title: 'New challenge for a compete!',
                        image: creator.profilePicture,
                        body: `🔥 ${creator.username} has challenged you to a compete!`,
                        badge: 1
                    })
                })
            } catch (error) {
                console.error('Error sending push notification:', error);
            }
        }
        // check if targeted user has added their teams
        if (!targetUser.teams || targetUser.teams.length < 1) {
            console.log('Target user has no teams to compete with');
            return res.status(400).json({ message: 'The user you are trying to challenge has no teams to compete with. Please ask them to add a team first.' });
        } else if (!creator.teams || creator.teams.length < 1) {
            console.log('You have no teams to compete with');
            return res.status(400).json({ message: 'You have no teams to compete with. Please add a team first.' });
        } else if (team && team.length === 2) {
            // check if the teams belong to the respective users
            if (!creator.teams.includes(team[0]) || !targetUser.teams.includes(team[1])) {
                console.log('One or both teams are not valid');
                return res.status(400).json({ message: 'Invalid teams selected for the competition' });
            } else if (team[0] === team[1]) {
                console.log('You cannot select the same team for both users');
                return res.status(400).json({ message: 'You cannot select the same team for both users' });
            } else {
                const newCompete = new Compete({
                    creator: currentUserObjectId,
                    targetedUser: targetedUserObjectId,
                    description: description || `Compete between ${creator.userdescription} and ${targetUser.userdescription}`,
                });
                console.log('New compete object created:', newCompete);

                if (status === 'accepted' && team && team.length === 2) {
                    newCompete.status = 'accepted';
                    newCompete.team = team;
                } else if (status === 'declined') {
                    newCompete.status = 'declined';
                }
                
                await newCompete.save();
                res.status(201).json({ message: 'Compete created successfully', compete: newCompete });
            }
        }        
    } catch (error) {
        console.error('Error creating compete:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;