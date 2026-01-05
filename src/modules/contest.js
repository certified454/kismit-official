// create a contest module that accept video submissions with description, video and audio files 
import mongoose from 'mongoose';

const contestSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true
    },
    video: {
        type: String,
        required: true
    },
    tags: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tag'
    }],
    audio: {
        type: String,
        required: true
    }
}, { timestamps: true });

const Contest = mongoose.model('Contest', contestSchema);

export default Contest;