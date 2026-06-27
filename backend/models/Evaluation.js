import mongoose from 'mongoose';

const evaluationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    problemDescription: {
        type: String,
        required: true
    },
    language: {
        type: String,
        required: true
    },
    intentGapScore: {
        type: Number,
        required: true
    },
    results: {
        type: Array,
        default: []
    },
    sourceCode: {
        type: String,
        default: ""
    },
    parsedIntent: {
        type: String,
        default: ""
    }
}, { timestamps: true });

export default mongoose.model('Evaluation', evaluationSchema);
