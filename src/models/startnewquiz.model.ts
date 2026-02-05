import { Schema, model } from 'mongoose';

const questionSchema = new Schema({
    question: {
        type: String,
        required: true,
    },
    options: {
        type: [String],
        required: true,
        validate: {
            validator: (v: string[]) => v.length === 3,
            message: 'Each question must have exactly 3 options',
        },
    },
    correct_answer: {
        type: String,
        required: true,
    },
    score: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
}, { _id: true });

const startNewQuizSchema = new Schema({
    topic: {
        type: String,
        required: true,
    },
    difficulty: {
        type: String,
        required: true,
        enum: ['easy', 'medium', 'hard'],
    },
    questions: {
        type: [questionSchema],
        default: [],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const StartNewQuiz = model("StartNewQuiz", startNewQuizSchema);
export default StartNewQuiz;
