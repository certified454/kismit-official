import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary";

const AnalysisSchema = new mongoose.Schema({
    user: {
        type: mongoose.Types.ObjectId,
        ref: 'User'
    },
    title: {
        type: String,
        default: '',
        required: true
    },
    video: {
        type: String,
        required: true
    },
},{timestamps: true})

const Analysis = mongoose.Model('Analysis', AnalysisSchema);

export default Analysis;