import mongoose from "mongoose";

const optionSchema = new mongoose.Schema({
    option: {
        type: String,
        required: true
    },
    value: {
        type: String,
        required: true
    },
    vote: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
});

const questionSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    checkBox: [optionSchema]
});

const challengeSchema = new mongoose.Schema({
    leagueImage: {
        type: String,
    },
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
    questions: [questionSchema],
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
    },
    vote: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    voteCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

export default mongoose.model("Challenge", challengeSchema);

