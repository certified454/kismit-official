import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import { Server } from 'socket.io'

import authRoutes from "./routes/authRoutes.js";
import userProfileRoute from './routes/userProfileRoutes.js';
import postRoutes from "./routes/postRoutes.js";
import anaylsisRoutes from './routes/anaylsisRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import likeRoute from './routes/likeRoute.js';
import { connectDB } from "./lib/db.js"

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'exp://10.172.168.188:8081',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }
});
app.set('io', io);

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '100mb' }));
app.use(cors());
app.use("/api/auth", authRoutes);
app.use("/api/user/profile", userProfileRoute);
app.use("/api/post", postRoutes);
app.use("/api/analysis", anaylsisRoutes);
app.use("/api", commentRoutes);
app.use("/api", likeRoute);

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);
    // add newPost event listener
    socket.on('new post created', (newPost) => {
        console.log('new post created:', newPost);
        io.emit('new post created', newPost);
    });
    socket.on('new analysis created', (newAnalysis) => {
        console.log('new analysis created:', newAnalysis);
        io.emit('new analysis created', newAnalysis);
    });
    // add newComment event listener
    socket.on('new comment created', (newComment) => {
        console.log('new comment created:', newComment);
        io.emit('new comment created', { postId })
    });
    // add newLike event listener
    socket.on('new like created', (postId, userId, liked) => {
        console.log('new like created:', postId, userId, liked);
        io.emit('new like created', { postId, userId, liked });
    });
    // add newFollow event listener
    socket.on('new follower', (userId, followerId, followed) => {
        console.log('new follower:', userId, followerId, followed);
        io.emit('new follower', { userId, followerId, followed });
    });
    // add getting user by Id event listener
    socket.on('userProfileUpdated', ( userId, updatedFields ) => {
        console.log('userProfileUpdated:', userId, updatedFields );
        io.emit('userProfileUpdated', { userId, updatedFields });
    });

    // disconnect event
    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
    })
});

server.listen(PORT, () => {
    console.log('Server is running on port 3000');
    connectDB();
});