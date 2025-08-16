import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary";

const AnalysisSchema = new mongoose.Schema({
    user: {
        type: mongoose.Types.ObjectId,
        ref: 'User'
    },
    //
    title: {
        type: String,
        default: ''
    },
    video: {
        type: String,
    },
},{timestamps: true})

const Analysis = mongoose.model('Analysis', AnalysisSchema);

export default Analysis;