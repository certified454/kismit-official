import express from "express"; 
import "dotenv/config";
import cors from "cors";
import http from "http";
import { Server } from 'socket.io'

import authRoutes from "./routes/authRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import commentRoutes from './routes/commentRoutes.js';
import likeRoute from './routes/likeRoute.js';
import { connectDB } from "./lib/db.js"

const app = express();
const server = http.createServer(app);
const io = new server(app, {
    cors: {
        origin: 'exp://10.92.156.82:8081',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }
})
const PORT = process.env.PORT || 3000;

app.use(express.json({limit: '100mb'}));
app.use(cors());
app.use("/api/auth", authRoutes);
app.use("/api/post", postRoutes);
app.use("/api", commentRoutes);
app.use("/api", likeRoute);

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);
    // add newPost event listener
    socket.on('new post created', (newPost) => {
        console.log('new post created:', newPost);
        io.emit('new post created', newPost);
    });
    // add newComment event listener
    socket.on('new comment created', (newComment) => {
        console.log('new comment created:', newComment);
        io.emit('new comment created', newComment)
    });
    // add newLike event listener
    socket.on('new like created', (newLike) => {
        console.log('new like created:', newLike);
        io.emit('new lke created', newLike);
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