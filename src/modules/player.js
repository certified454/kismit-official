import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    position: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
    },
    stats: {
        type: Object,
    }
}, { timestamps: true });

export default mongoose.model("Player", playerSchema);