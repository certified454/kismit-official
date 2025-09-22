import mongoose from "mongoose";

const competeSchema = new mongoose.Schema({
    name: {
        type: String
    },
    teams: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    }],
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    targetedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
}, { timestamps: true });

export default mongoose.model("Compete", competeSchema);