import mongoose from 'mongoose';
import Clodinary from '../lib/cloudinary.js'
import cloudinary from '../lib/cloudinary.js';

const newsSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    description: {
        type: String,
        required: true
    },
    pictures: [{
        type: String,
        required: true,
    }],
    like: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    unlike: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    likesCount: {
        type: Number,
        default: 0
    },
    unlikesCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Pre hook to delete any data associated with a news item
newsSchema.pre('deleteOne', { document: true, query: false}, async function(next) {
    console.log(`Pre-deleteOne hook for news item: ${this._id}`);

    try {
        // delete the news likes and unlikes if a particular news is deleted
        await Like.deleteMany({ news: this._id});

        if(this.pictures && this.pictures.includes('cloudinary')) {
            try {
                const pubId = this.pictures.split('/').pop.split('.')[0]
                await cloudinary.uploader.destroy(pubId)
            } catch (error) {
                console.error('Error deleting pictures from Cloudinary in pre-hook:', error);
            }
        }
        next();
    } catch (error) {
        console.error('Error in pre-deleteOne hook for news item:', error);
        next(error);
    }
});

const News = mongoose.model('News', newsSchema);

export default News;