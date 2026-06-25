import mongoose from 'mongoose';

const contestSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        tag: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tag',
            required: true,
        },
        // Denormalised tag string, e.g. "februarycontest" – avoids a join on every read
        tagName: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
            default: Date.now,
        },
        // Day 25 – submissions close
        submissionsClose: {
            type: Date,
            required: true,
        },
        // Day 35 – winners announced
        winnersAnnouncedAt: {
            type: Date,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Winner entries populated after winnersAnnouncedAt
        winners: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'ContestEntry',
            },
        ],
    },
    { timestamps: true }
);

const Contest = mongoose.model('Contest', contestSchema);
export default Contest;