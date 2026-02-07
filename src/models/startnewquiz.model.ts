import { Schema, model, Types } from 'mongoose';

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
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
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
    // Quiz result fields (populated when quiz is completed)
    isCompleted: {
        type: Boolean,
        default: false,
    },
    answers: {
        type: Map,
        of: String,
        default: {},
    },
    correctCount: {
        type: Number,
        default: 0,
    },
    totalScore: {
        type: Number,
        default: 0,
    },
    earnedScore: {
        type: Number,
        default: 0,
    },
    completedAt: {
        type: Date,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const StartNewQuiz = model("StartNewQuiz", startNewQuizSchema);
export default StartNewQuiz;
