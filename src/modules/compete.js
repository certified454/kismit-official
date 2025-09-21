import mongoose from "mongoose";

const competeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    teams: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    status: {
        type: String,
        required: true
    }
}, { timestamps: true });

export default mongoose.model("Compete", competeSchema);