import express from 'express';
import Tag from '../modules/tag.js';
import protectRoute from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/tagid', protectRoute, async ( req, res) => {
    const tagId = req.params.tagId
    try {
        const tag = await Tag.findById(tagId)
        .populate('user', 'username profilePicture', 'post', 'image createdAt');
        if (!tag) {
            console.log(error, "Error in fetching tag by ID");
            return res.status(404).json({ message: 'Tag not found' });
        };
        res.status(200).json(tag);
        
    } catch (error) {
        console.log(error, "Error in fetching tag by ID");
    }
})

export default router;