import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { type } from "os";

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },  
    profilePicture: {
        type: String,
        default: ""
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationCode: {
        type: String,
        default: ""
    },
    verificationCodeExpires: {
        type: Date,
        default: Date.now
    },
    bio: {
        type: String,
        default: ""
    },
    fullName: {
        type: String,
        default: ""
    },
    location: {
        type: String,
        default: ""
    },
    gender: {
        type: String,
        default: 'other'
    },
    hobbies: {
        type: [String],
        default: []
    },
    phone: {
        type: String,
        default: ""
    },
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    expoPushToken: {
        type: String
    },
    followersCount: {
        type: Number,
        default: 0
    },
    followingCount: {
        type: Number,
        default: 0
    },
    usernameLastChanged: {
        type: Date,
        default: Date.now
    },
    editProfile: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

//hash password before saving to database
userSchema.pre("save", async function (next){

    if (!this.isModified("password")) {
        return next();
    ;}

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// compare password function

userSchema.methods.comparePassword = async function (userpassword) {
    return await bcrypt.compare(userpassword, this.password);
}

const User = mongoose.model("User", userSchema);

export default User;
