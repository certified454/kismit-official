import jwt from 'jsonwebtoken';
import User from '../modules/user.js';

const protectRoute = async (req, res, next) => {
    try{
        //get token from header
        const token = req.headers("Authrization").replace("Bearer", "");
        if (!token) return res.status(401).json({ message: "No token provided" });
        
        //verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        //find user by id
        const user = await User.findById(decoded.userId).select("-password");
        if (!user) return res.status(401).json({ message: "Invalid token" });

        req.user = user;
        next()

    } catch (error) {
        console.log("error in auth middleware", error);
        res.status(500).json({ message: "Server error" });
    }
};

export default protectRoute;