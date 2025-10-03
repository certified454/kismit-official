import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    leagueName: {
        type: String,
        required: true,
    },
    matchDate: {
        type: Date,
        required: true,
    },
    time: {
        type: Date,
        required: true,
    },
    location: {
        type: String
    },
    homeTeamName: {
        type: String,
        required: true,
    },
    awayTeamName: {
        type: String,
        required: true,
    },
    homeTeamLogo: {
        type: String,
    },
    awayTeamLogo: {
        type: String,
    },
}, { timestamps: true });

export default mongoose.model('Match', matchSchema);