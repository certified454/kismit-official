import express from "express";
import admin from '../lib/firebaseAdmin.js';
import protectRoute from "../middleware/auth.middleware";

const router = express.Router();

router.post('/push-notification', protectRoute, async (req, res) => {
    try {
        const { fcmToken, title, body } = req.body;

        if(!fcmToken || !title || !body){
            console.log('missing required fields')
            return res.status(400).json({ message: 'missing required fields' });
        };
        const message = {
            notification: { title, body },
            token: fcmToken
        }
        try {
            const response = await admin.messaging().send(message);
            console.log('Push notification sent successfully:', response);
            return res.status(200).json({ message: 'Push notification sent successfully' });
        } catch (error) {
            console.error('Error sending push notification failed:', error);
            return res.status(500).json({ messgae: 'Error sending push notification'});
        };
    } catch (error) {
        console.error("Error in push notification route:", error);
        res.status(500).send("Internal Server Error");
    }
})
export default router;

