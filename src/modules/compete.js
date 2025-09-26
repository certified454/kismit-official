import mongoose from "mongoose";

const competeSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'completed'],
        default: 'pending'
    },
    creatorScore: {
        type: Number,
        default: 0
    },
    targetedUserScore: {
        type: Number,
        default: 0
    },
    creatorTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    },
    targetTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    targetedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
}, { timestamps: true });

export default mongoose.model("Compete", competeSchema);