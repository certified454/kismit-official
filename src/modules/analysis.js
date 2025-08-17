import mongoose from 'mongoose';

const analysisSchema = new mongoose.Schema({
    title: {
        type: String
    },
    video: {
        type: String
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    like: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    likesCounts: {
        type: Number,
        default: 0
    },
}, { timestamps: true });

const Analysis = mongoose.model('Analysis', analysisSchema);

export default Analysis;
