import express from 'express';
import protectRoute from '../middleware/auth.middleware.js';
import Compete from '../modules/compete.js';
import User from '../modules/user.js';
import Team from '../modules/team.js';
import { request } from 'http';

const router = express.Router();

//get the targeted user's info and get his expoPushToken to send a notification
router.get('/target/:userId', protectRoute, async (req, res) => {
    const userId = req.params.userId;
    try {
        const targetUser = await User.findById(userId).select('username profilePicture expoPushToken');
        if (!targetUser) {
            console.log('Target user not found');
            return res.status(404).json({ message: 'Target user not found' });
        };
        console.log('Target user found:', targetUser);
        res.status(200).json({ targetUser });
    } catch (error) {
        console.error('Error fetching target user:', error);
        res.status(500).json({ error: 'Internal server error' });
    } 
});

router.post('/register', protectRoute, async (req, res) => {
    const currentUserObjectId = req.user._id;

    const { targetedUserObjectId } = req.body;
    const { description, creatorTeam } = req.body;

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
        
        if (!creatorTeam) { 
            console.log('Add a team for the competition');
            return res.status(400).json({ message: 'Add a team for the competition' });
        };

        //check which team the creator chose and set it as the competition team
        const competitonTeam = await Team.findById(creatorTeam);
        if (!competitonTeam || competitonTeam.owner.toString() !== currentUserObjectId.toString()) {
            console.log('Invalid team for the competition');
            return res.status(400).json({ message: 'Invalid team for the competition' });
        }
        if (existingCompetition) {
            console.log('A competition between these users already exists');
            return res.status(400).json({ message: 'This competition already exists between you and the competing user' });
        };

        if (targetUser.expoPushToken) {
            const acceptLink = `ksm://(respond)/${currentUserObjectId}`;
            try {
                await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: targetUser.expoPushToken,
                        title: 'New challenge for you!',
                        image: creator.profilePicture,
                        body: `🔥 ${creator.username} has challenged you to a competition! go to the app to Accept or decline their request.`,
                        data: {
                            url: acceptLink
                        },
                        badge: 1
                    })
                });
            } catch (error) {
                console.error('Error sending push notification:', error);
            }
        };
        const newCompete = new Compete({
            creator: currentUserObjectId,
            targetedUser: targetedUserObjectId,
            description,
            status: 'pending',
            creatorTeam
        })
        await newCompete.save();
        console.log('Competition created successfully:', newCompete);

        res.status(200).json({ message: 'Challenge sent. Awaiting response.' });
    } catch (error) {
        console.error('Error creating compete:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:id', protectRoute, async (req, res) => {
    const competeId = req.params.id;
    try {
        const competition = await Compete.findById(competeId)
        .populate('creator', 'username profilePicture')
        .populate('targetedUser', 'username profilePicture')
        .populate('creatorTeam')
        .populate('targetTeam');
        if (!competition) {
            console.log('Competition not found');
            return res.status(404).json({ message: 'Competition not found' });
        }
        console.log('Competition found:', competition);
        res.status(200).json({ competition });
    } catch (error) {
        console.error('Error fetching competition:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/respond', protectRoute, async (req, res) => {
    const targetedUserId = req.user._id;
    const competeId = req.body.competeId;
    const { status, targetTeam } = req.body;
    try {
        const competition = await Compete.findById(competeId);
        if (!competition) {
            console.log('Competition not found');
            return res.status(404).json({ message: 'Competition not found' });
        };
        // check if the user responding to the compete is the targeted user
        if (targetedUserId !== competition.targetedUser.toString()) {
            console.log('You are not authorized to respond to this competition');
            return res.status(403).json({ message: 'You are not authorized to respond to this competition' });
        };
        if (competition.status !== 'pending') {
            console.log('This competition has already been responded to');
            return res.status(400).json({ message: 'This competition has already been responded to' });
        };
       
        if (!targetTeam) {
            console.log('Add a team to accept the competiton');
            return res.status(400).json({message: 'Add a team to accept the competiton' });
        }

        competition.status = status && 'accepted' || 'pending';
        competition.targetTeam = targetTeam;
        await competition.save();
        res.status(200).json({ message: `Competition ${status}` });
    } catch (error) {
        console.error('Error responding to compete:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;