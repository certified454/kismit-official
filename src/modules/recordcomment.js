import mongoose from 'mongoose';

const recordCommentSchema = new mongoose.Schema({
    audioUrl: {
        type: String,
        required: true,
    },
    duration: {
        type: Number
    },
    parentComment: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "parrentCommentType",
        required: false
    },
    parentCommentType: {
        type: String,
        enum: ["TextComment", "RecordComment"],
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
}, { timestaps: true } );

const RecordComment = mongoose.model("RecordComment", recordCommentSchema);

export default RecordComment;