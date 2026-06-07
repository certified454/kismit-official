import mongoose from 'mongoose';

const videoGenerationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    prompt: {
        type: String,
        required: true,
        default: ''
    },
    videoUrl: {
        type: String,
        required: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {timestamps: true});

export default mongoose.model('VideoGeneration', videoGenerationSchema);