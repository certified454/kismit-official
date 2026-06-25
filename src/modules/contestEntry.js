import mongoose from 'mongoose';

const contestEntrySchema = new mongoose.Schema(
    {
        contest: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Contest',
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        video: {
            type: String,
            required: true,
        },
        videoDuration: {
            type: Number, // seconds
            required: true,
        },
        views: {
            type: Number,
            default: 0,
        },
        likes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        // 'pending' | 'approved' | 'rejected'  – add moderation if needed
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'approved',
        },
    },
    { timestamps: true }
);

// Compound index: one entry per user per contest
contestEntrySchema.index({ contest: 1, user: 1 }, { unique: true });

// Virtual: interaction score used for ranking winners
contestEntrySchema.virtual('score').get(function () {
    return this.views + this.likes.length * 3; // likes weighted 3×
});

const ContestEntry = mongoose.model('ContestEntry', contestEntrySchema);
export default ContestEntry;