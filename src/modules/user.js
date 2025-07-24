import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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
        required: true,
        default: "https://api.dicebear.com/9.x/miniavs/svg?seed=George&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,ffdfbf"
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