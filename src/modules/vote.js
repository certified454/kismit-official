import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    challenge: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Challenge',
        required: true
    },
    option: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Challenge.questions.checkBox',
        required: true
    },
}, { timestamps: true });

export default mongoose.model("Vote", voteSchema);