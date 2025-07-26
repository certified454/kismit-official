import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
    text:{
        type: String,
    },
    audioUrl:{
        type: String,
    },
     type: {
            type: String,
            enum: ['text', 'audio'],
            required: true,
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
    if (this.type === 'text' && !this.text){
        return next(new Error('Input field cannot be be empty'))
    };

    if (this.type === 'audio' && !this.audio) {
        return next(new Error('Record a voice message to comment'))
    };

    next();
});

const Comment = mongoose.model("Comment", commentSchema)

export default Comment;