import mongoose from "mongoose";
import Comment from './comment.js';
import Like from './like.js';
import Clodinary from '../lib/cloudinary.js'

const postSchema = new mongoose.Schema({
    caption: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    comments: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment"
    },
    likes: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Like"
    },
    commentsCount: {
        type: Number,
        default: 0,
    },
    likesCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

//pre hook to delete any data associated with a post
postSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
    console.log(`Pre-deleteOne hook for post: ${this._id}`);

    try {
        await Comment.deleteMany({post: this._id});
        await Like.deleteMany({post: this._id})

        if(this.file && this.file.includes('cloudinary'))
            try {
                const pubId = this.file.split('/').pop.split('.')[0]
                await Clodinary.uploader.destroy(pubId)
            } catch (error) {
                console.error("Error deleting image from Cloudinary in pre-hook:", error);
            }
        next();
    } catch (error) {
        console.error("Error in post delete pre-hook:", error);
        next();
    }
});

const Post = mongoose.model("Post", postSchema);

export default Post;