import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
    text:{
        type: String,
    },
    audio:{
        type: String,
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
}, { timestamps: true});

//ensure that at least text or audio is present base on the type
commentSchema.pre('save', function(next) {
    if (!this.text && !this.audio){
        return next(new Error('Comment must have either text or audio recorded'))
    };

    next();
});

const Comment = mongoose.model("Comment", commentSchema)

export default Comment;