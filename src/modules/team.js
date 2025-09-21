import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Player"
    }]

}, { timestamps: true });

export default mongoose.model("Team", teamSchema);