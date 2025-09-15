import mongoose from "mongoose";

const tagSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    posts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post"
    }]
}, { timestamps: true });

const Tag = mongoose.model("Tag", tagSchema);

export default Tag;
