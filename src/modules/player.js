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
    },
    espnId: {
        type: String,
        unique: true,
        sparse: true
    },
    espnRaw: {
        type: mongoose.Schema.Types.Mixed,
    }
}, { timestamps: true });

export default mongoose.model("Player", playerSchema);