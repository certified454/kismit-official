import jwt from 'jsonwebtoken';
import User from '../modules/user.js';

const ownerOnly = async (req, res, next) => {
    try {
        if (!req.user || !req.user.isOwner) {
            return res.status(403).json({message: 'Forbidden: Owner access only' });
        }
        next();
    } catch (error) {
        console.log("Failed:", "internal server error")
        res.status(400).json({message: "internal server error"})
    }
};

export default ownerOnly;