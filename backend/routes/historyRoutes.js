import express from 'express';
const router = express.Router();
import auth from '../middleware/auth.js';
import Evaluation from '../models/Evaluation.js';

// Get history for the logged-in user
router.get('/', auth, async (req, res) => {
    try {
        const evaluations = await Evaluation.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json(evaluations);
    } catch (err) {
        console.error("History Fetch Error:", err);
        res.status(500).json({ error: 'Server error fetching history' });
    }
});

// Save a new evaluation
router.post('/', auth, async (req, res) => {
    try {
        const evaluation = new Evaluation({
            userId: req.user._id,
            ...req.body
        });
        await evaluation.save();
        res.json(evaluation);
    } catch (err) {
        console.error("History Save Error:", err);
        res.status(500).json({ error: 'Server error saving history' });
    }
});

export default router;
