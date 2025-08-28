import mongoose, { mongo } from "mongoose";

const poolOptionSchema = new mongoose.Schema({
    optionText: {
        type: String,
        required: true,
        trim: true
    },
    vote: [{
        type: mongo.Schema.Types.ObjectId,
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
    createdBy: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'User',
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
    votePerUser:[ {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isChallengeActive: {
        type: Boolean,
        default:  true
    }
}, { timestamps: true });

export default mongoose.model("Challenge", challengeSchema);