import express from "express"; 
import "dotenv/config";
import cors from "cors";

import authRoutes from "./routes/authRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import { connectDB } from "./lib/db.js"

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({limit: '100mb'}));
app.use(cors());
app.use("/api/auth", authRoutes);
app.use("/api/post", postRoutes);

app.listen(PORT, () => {
    console.log('Server is running on port 3000');
    connectDB();
});