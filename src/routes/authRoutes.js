import express from "express";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import "dotenv/config";

import User from "../modules/user.js";

const router = express.Router();

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "15d" });
};

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    if (username.length < 3) {
      return res
        .status(400)
        .json({ message: "Username must be at least 3 characters long" });
    }

    //check if user already exists
    const existsingUser = await User.findOne({
      $or: [{ username }, { email }],
    });
    if (existsingUser)
      return res.status(400).json({ message: "User already exists" });

    //check if email already exists
    const emailEmail = await User.findOne({ email });
    if (emailEmail)
      return res.status(400).json({ message: "User already exists" });

    const profilePicture =
      "https://api.dicebear.com/6.x/initials/svg?seed=${username}";

    //generate verification code
    const generateVerificationCode = () => {
      return Math.floor(1000 + Math.random() * 9000).toString();
    };
    const verificationCode = generateVerificationCode();
    const verificationCodeExpires = Date.now() + 15 * 60 * 1000; // 15 minutes

    const user = new User({
      username,
      email,
      password,
      profilePicture,
      verificationCode,
      verificationCodeExpires,
      isVerified: false,
    });

    await user.save();

    //configure nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 465,
      secure: true,
      host: "smtp.gmail.com",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Email Verification",
      html: `
                <Doctype html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Verify your email</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            background-color: #ffffff;
                            color: #000;
                            margin: 0;
                            padding: 20px;
                            line-height: 1.6;
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 30px;
                            background-color: #ffffff;
                            border-radius: 5px;
                            box-shadow: 0 2px 2px rgb(122, 30, 189);
                        }
                        .footer {
                            margin-top: 20px;
                            padding: 10px;
                            background-color: #ffffff;
                            text-align: center;
                            font-size: 12px;
                            color: #777777;
                            border-radius: 5px;
                            box-shadow: 0 2px 2px rgb(122, 30, 189);
                        }
                        h1 {
                            color: #4B0082;
                            font-size: 24px;
                            margin-bottom: 20px;
                            text-align: center;
                        }
                        h2 {
                            color: #333333;
                            font-size: 40px;
                            margin-bottom: 20px;
                            text-align: center;
                            margin-inline: 20px;
                        }
                        p {
                            font-size: 16px;
                            margin-bottom: 20px;
                            color: #000000;
                        }
                        .note {
                            font-size: 14px;
                            color: #777777;
                            margin-top: 25px;
                        }
                        .thank-you {
                            font-size: 16px;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Verify Your Email</h1>
                        <img src="https://github.com/certified454/My-portfolio/blob/326ea0bcae6116cb6b6058825fe4df08f3bec7c1/adaptive-icon.png" alt="Kismet Logo" style="width: 100px; height: auto; margin-bottom: 20px;">
                        <p>Hi ${username},</p>
                        <p>Thank you for registering with us! To complete your registration, please verify your email by inputing this four digit code bellow:</p>
                        <h2>${verificationCode}</h2>
                        <p>This link will expire in 15 minutes.</p>
                        <p class="note" >If you did not create an account, no further action is required. Feel free to ignore this email.</p>
                        <p class="thank-you">Thank you!</p>
                        <p>The Kismet Team KSM</p>
                    </div>
                   <div class="footer">
                        <p class="note" >If you have any questions, feel free to reach out to our support team.</p>
                        <p style="text-align: center; font-size: 12px; color: #777777;">This email was sent to ${email}. If you no longer wish to receive emails from kismet, you can unsubscribe at any time.</p>
                        <p style="text-align: center; font-size: 12px; color: #777777;">&copy; ${new Date().getFullYear()} Kismet. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error Sending Verification Email", error);
        return res
          .status(500)
          .json({ message: "Error sending verification email" });
      }
      const token = generateToken(user._id);
      res.status(201).json({
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          profilePicture: profilePicture,
          isVerified: user.isVerified,
        },
      });
    });
  } catch (error) {
    console.log("Error in register route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      console.log("Email and verification code is required.");
      return res
        .status(400)
        .json({ message: "Email and verification code is required." });
    }

    if (code.length !== 4) {
      console.log("Verification code must be 4 digits.");
      return res
        .status(400)
        .json({ message: "Verification code must be 4 digits." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found");
      return res.status(400).json({ message: "User not found" });
    }

    if (user.isVerified) return res.status(400).json({ message: "User already verified" });

    if (String(user.verificationCode) !== String(code).trim()) {
      console.log(
        "verification code is invalid please check the email we sent to you"
      );
      return res.status(400).json({
        message: `verification code is invalid please check the email we sent to you on, ${email}`,
      });
    }
    if (user.verificationCodeExpires < Date.now()) {
      user.verificationCode = null;
      user.verificationCodeExpires = null;
      await user.save();
      return res.status(400).json({
        message: "Verification code has expired. Please request a new one.",
      });
      console.log("Verification code has expired. Please request a new one.");
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

    res.status(200).json({ message: "Account verification is successful" });
    console.log("Account verification is successful");
  } catch (error) {
    console.log("Error in verify route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/resend-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required!" });

    const user = await User.findOne({ email });

    if (!user)
      return res.status(200).json({
        message: `If an account with this email ${email} exist, we have resend a verification code to it`,
      });

    if (user.isVerified)
      return res
        .status(400)
        .json({ message: "This account is already verified" });

    const generateNewVerificationCode = () => {
      return Math.floor(1000 + Math.random() * 9000).toString();
    };
    const newVerificationCode = generateNewVerificationCode();
    const newVerificationCodeExpires = Date.now() + 15 * 60 * 1000; // 15 minutes

    user.verificationCode = newVerificationCode;
    user.verificationCodeExpires = newVerificationCodeExpires;
    await user.save();
    res.status(200).json({
      message: `A new verification code has been sent to ${email}. Please check your email for the code.`,
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 465,
      secure: true,
      host: "smtp.gmail.com",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Email Verification",
      html: `
                <Doctype html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Verify your email</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            background-color: #ffffff;
                            color: #000000;
                            margin: 0;
                            padding: 20px;
                            line-height: 1.6;
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 30px;
                            background-color: #ffffff;
                            border-radius: 5px;
                            box-shadow: 0 2px 2px rgb(122, 30, 189);
                        }
                        .footer {
                            margin-top: 20px;
                            padding: 10px;
                            background-color: #ffffff;
                            text-align: center;
                            font-size: 12px;
                            color: #777777;
                            border-radius: 5px;
                            box-shadow: 0 2px 2px rgb(122, 30, 189);
                        }
                        h1 {
                            color: #4B0082;
                            font-size: 24px;
                            margin-bottom: 20px;
                            text-align: center;
                        }
                        h2 {
                            color: #333333;
                            font-size: 40px;
                            margin-bottom: 20px;
                            text-align: center;
                            margin-inline: 20px;
                        }
                        p {
                            font-size: 16px;
                            margin-bottom: 20px;
                            color: #000000;
                        }
                        .note {
                            font-size: 14px;
                            color: #777777;
                            margin-top: 25px;
                        }
                        .thank-you {
                            font-size: 16px;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <img src="https://github.com/certified454/My-portfolio/blob/326ea0bcae6116cb6b6058825fe4df08f3bec7c1/adaptive-icon.png" alt="Kismet Logo" style="width: 100px; height: auto; margin-bottom: 20px;">
                        <h1>Verify Your Email</h1>
                        <p>Hi ${user.username},</p>
                        <p>Thank you for registering with us! To complete your registration, please verify your email by inputing this four digit code bellow:</p>
                        <h2>${newVerificationCode}</h2>
                        <p>This link will expire in 15 minutes.</p>
                        <p class="note" >If you did not create an account, no further action is required. Feel free to ignore this email.</p>
                        <p class="thank-you">Thank you!</p>
                        <p>The Kismet Team KSM</p>
                    </div>
                   <div class="footer">
                        <p class="note" >If you have any questions, feel free to reach out to our support team.</p>
                        <p style="text-align: center; font-size: 12px; color: #777777;">This email was sent to ${email}. If you no longer wish to receive emails from kismet, you can unsubscribe at any time.</p>
                        <p style="text-align: center; font-size: 12px; color: #777777;">&copy; ${new Date().getFullYear()} Kismet. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error send email", error);
        return res.status(500).json({ message: "error sending email" });
      }
      console.log("Email sent");
      return res.status(200).json({ message: `Email sent to ${email}` });
    });
  } catch (error) {
    console.log("Error in resend code route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "All fields are required" });

    //check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid Cridentials" });

    if (!user.isVerified) {
      console.log("User is not verified");
      return res.status(400).json({
        message: "Account is not verified",
      });
    }

    //check if password is matching
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect)
      return res.status(400).json({ message: "Invalid Credentials" });

    const token = generateToken(user._id);

    user.lastLogin = Date.now();
    await user.save();

    res.status(200).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    console.log("Error in login route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
