import express from 'express';
const router = express.Router();
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ error: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({ email, password: hashedPassword });
        await user.save();

        const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, email: user.email } });
    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid email or password' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid email or password' });

        const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, email: user.email } });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

// Generate and send password reset link
router.post('/forgot-password', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            // Standard security practice: Don't reveal if a user exists
            return res.json({ message: "If an account with that email exists, we sent a reset link to it." });
        }

        // Generate token
        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetUrl = `http://${req.headers.host.includes('localhost') || req.headers.host.includes('127.0.0.1') ? 'localhost:5173' : req.headers.host}/?resetToken=${token}`;
        
        let transporter;
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            transporter = nodemailer.createTransport({
                service: 'gmail', // or configured host
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            });
        } else {
            // Fallback to ethereal testing email
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass }
            });
        }

        const mailOptions = {
            from: '"Confidence Scorer AI" <noreply@confidence-scorer.com>',
            to: user.email,
            subject: 'Password Reset Request',
            text: `You are receiving this because you (or someone else) requested a password reset for your account.\n\n` +
                  `Please click on the following link, or paste it into your browser to complete the process:\n\n` +
                  `${resetUrl}\n\n` +
                  `If you did not request this, please ignore this email and your password will remain unchanged.\n`
        };

        const info = await transporter.sendMail(mailOptions);
        
        const responseData = { message: "If an account with that email exists, we sent a reset link to it." };
        // If using Ethereal, send the preview URL back for easy testing in development
        if (!process.env.SMTP_USER) {
            responseData.previewUrl = nodemailer.getTestMessageUrl(info);
            console.log("Password Reset Test Email URL:", responseData.previewUrl);
        }

        res.json(responseData);
    } catch (err) {
        console.error("Forgot Password Error:", err);
        res.status(500).json({ error: "Error sending email" });
    }
});

// Verify token and reset password
router.post('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: "Password reset token is invalid or has expired." });
        }

        // Set the new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.password, salt);
        
        // Clear reset fields
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: "Success! Your password has been changed. You can now login." });
    } catch (err) {
        console.error("Reset Password Error:", err);
        res.status(500).json({ error: "Error resetting password" });
    }
});

export default router;
