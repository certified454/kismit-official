import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import { Server } from 'socket.io'

import authRoutes from "./routes/authRoutes.js";
import userProfileRoute from './routes/userProfileRoutes.js';
import postRoutes from "./routes/postRoutes.js";
import anaylsisRoutes from './routes/analysis.js';
import commentRoutes from './routes/commentRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import likeRoute from './routes/likeRoute.js';
import challengeRoutes from './routes/challengeRoutes.js';
import sportsRoutes from './routes/sportsRoutes.js';
import voteRoutes from './routes/voteRoutes.js';
import competeRoutes from './routes/competeRoutes.js';
import teamRoutes from "./routes/teamRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import newsRoutes from "./routes/newsRoutes.js";
import tagsRoutes from "./routes/tagsRoutes.js";
import contestRoutes from "./routes/contestRoutes.js";
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
app.use("/api", searchRoutes);
app.use("/api", likeRoute);
app.use("/api/challenge", challengeRoutes);
app.use("/api/sports", sportsRoutes);
app.use("/api", voteRoutes);
app.use("/api/compete", competeRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/tags", tagsRoutes);
app.use("/api/contest", contestRoutes);

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);
  
    socket.on('new post created', (newPost) => {
        console.log('new post created:', newPost);
        io.emit('new post created', newPost);
    });
    socket.on('new analysis created', (newAnalysis) => {
        console.log('new analysis created:', newAnalysis);
        io.emit('new analysis created', newAnalysis);
    });
    socket.on('new comment created', (newComment) => {
        console.log('new comment created:', newComment);
        io.emit('new comment created', { postId, newComment })
    });
    socket.on('new like created', (postId, userId, liked) => {
        console.log('new like created:', postId, userId, liked);
        io.emit('new like created', { postId, userId, liked });
    });
    socket.on('new follower', (userId, followerId, followed) => {
        console.log('new follower:', userId, followerId, followed);
        io.emit('new follower', { userId, followerId, followed });
    });
    socket.on('userProfileUpdated', ( userId, updatedFields ) => {
        console.log('userProfileUpdated:', userId, updatedFields );
        io.emit('userProfileUpdated', { userId, updatedFields });
    });
    socket.on('new challenge created', (populatedChallenge) => {
        console.log('new challenge created:', populatedChallenge);
        io.emit('new challenge created', populatedChallenge);
    });
    socket.on('new vote created', (populatedVote) => {
        console.log('new vote created:', populatedVote);
        io.emit('new vote created', populatedVote);
    });
    socket.on('newContest', (newContest) => {
        console.log('new contest created:', newContest);
        io.emit('newContest', newContest);
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