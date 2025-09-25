import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    position: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
    },
    stats: {
        type: Object,
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
}, { timestamps: true });


//pre save hook to ensure unique player names per user
playerSchema.pre('save', async function (next) {
    const player = this;
    const existingPlayer = await mongoose.model("Player").findOne({ name: player.name, owner: player.owner });
    if (existingPlayer) {
        return next(new Error('Player with this name already exists'));
    }
    next();
});

export default mongoose.model("Player", playerSchema);