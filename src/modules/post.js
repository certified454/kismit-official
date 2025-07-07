import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
    description: {
        type: String,
    },
    file: {
        type: String,
    },
    location: {
        type: String,
        default: ""
    },
    likes: {
        type: Number,
        default: 0
    },
    comments: {
        type: Number,
        default: 0
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
}, { timestamps: true });

const Post = mongoose.model("Post", postSchema);

export default Post;