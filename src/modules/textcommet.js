import mongoose from 'mongoose';

const textCommentSchema = new mongoose.Schema({
    text:{
        type: String,
        required: true,
    },
    parentComment: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "parrentCommentType",
        required: false
    },
    parentCommentType: {
        type: String,
        enum: ["RecordComment", "TextComment"],
        required: function(){
            return this.parentComment !== undefined && this.parentComment !== null;
        }
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

const TextComment = mongoose.model("TextComment", textCommentSchema)

export default TextComment;