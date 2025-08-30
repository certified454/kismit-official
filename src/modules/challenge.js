import mongoose from "mongoose";

const poolOptionSchema = new mongoose.Schema({
    optionText: {
        type: String,
        required: true,
        trim: true
    },
    vote: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
});

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
    pools: [
        poolOptionSchema
    ],
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isChallengeActive: {
        type: Boolean,
        default:  true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

export default mongoose.model("Challenge", challengeSchema);