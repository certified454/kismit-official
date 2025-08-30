import mongoose from "mongoose";
import { type } from "os";

const challengeSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    time: {
        type: Date,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    pools: [{
        type: String,
        required: true,
        trim: true
    }],
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    votePerUser: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isChallengeActive: {
        type: Boolean,
        default:  true
    }
}, { timestamps: true });

export default mongoose.model("Challenge", challengeSchema);