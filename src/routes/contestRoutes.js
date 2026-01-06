import express from 'express';
import Contest from '../modules/contest.js';
import protectRoute from '../middleware/auth.middleware.js';
import cloudinary from '../lib/cloudinary.js';
import User from '../modules/user.js';
import Tag from '../modules/tag.js';

const router = express.Router();

// Route to create a new contest submission with video and audio files
router.post('/contest', protectRoute, async (req, res) => {
    const { description, video, audio } = req.body;

    try {
        const RegExp = /#(\w+)/g;
        const extractedTags = description.match(RegExp);
        const tags = extractedTags ? extractedTags.map(tag => tag.substring(1)) : [];
        console.log("Extracted tags:", tags, "from description:", description);

        const videoUrl = await cloudinary.uploader.upload(video, { resource_type: 'video' });
        const audioUrl = await cloudinary.uploader.upload(audio, { resource_type: 'audio' });

        if (!description || !videoUrl || !audioUrl) {
            console.log('All fields are required');
            return res.status(400).json({ message: 'All fields are required' });
        };

        // lets add a check that flags inappropriate video if its greater than 1 minute longer
        if (videoUrl.duration > 60) {
            console.log('Video duration exceeds the limit of 1 minute');
            return res.status(400).json({ message: 'Video duration exceeds the limit of 1 minute' });
        };
        // lets add tag to description while creating contest
        const tagId = [];
        for (const tagName of tags) {
            let tag = await Tag.findOne({ name: tagName });
            if (!tag) {
                tag = new Tag({ name: tagName, contests: [] });
                await tag.save();
            }   
            tagId.push(tag._id);
        };
        
        // create contest
        const context = new Contest({
            description,
            video: videoUrl.secure_url,
            audio: audioUrl.secure_url,
            tags: tagId
        });
        for (const tagIds of tagId) {
            await Tag.findByIdAndUpdate(tagIds, { $addToSet: { contests: context._id } });
        }
        await context.save();

        const populatedContest = await Contest.findById(context._id)
            .populate('user', 'username profilePicture')
            .populate('tags', 'name');
        // emit event to contest creation
        req.app.get('io').emit('newContest', {
            _id: populatedContest._id,
            user: {
                id: populatedContest.user._id,
                username: populatedContest.user.username,
                profilePicture: populatedContest.user.profilePicture
            },
            description: populatedContest.description,
            video: populatedContest.video,
            audio: populatedContest.audio,
            tags: populatedContest.tags,
            createdAt: populatedContest.createdAt
        }); 
        console.log("Saved contest tags:", context.tags);
        res.status(201).json(populatedContest);
    } catch (error) {
        console.error("Error creating contest:", error);
        res.status(500).json({ message: "Server error while creating contest" });
    }

})

export default router;