import { Schema, model, Types, Document } from 'mongoose';

// Question schema for game sessions
const gameQuestionSchema = new Schema({
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

// Answer schema for tracking player responses
const answerSchema = new Schema({
  questionIndex: {
    type: Number,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
  isCorrect: {
    type: Boolean,
    required: true,
  },
  timeMs: {
    type: Number,
    required: true,
  },
  score: {
    type: Number,
    required: true,
    default: 0,
  },
}, { _id: false });

export interface IGameSession extends Document {
  hostId: Types.ObjectId;
  guestId: Types.ObjectId | null;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  rounds: number;
  questionsPerRound: number;
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled';
  questions: {
    question: string;
    options: string[];
    correct_answer: string;
    score: number;
    _id: Types.ObjectId;
  }[];
  hostAnswers: {
    questionIndex: number;
    answer: string;
    isCorrect: boolean;
    timeMs: number;
    score: number;
  }[];
  guestAnswers: {
    questionIndex: number;
    answer: string;
    isCorrect: boolean;
    timeMs: number;
    score: number;
  }[];
  currentQuestionIndex: number;
  currentRound: number;
  hostScore: number;
  guestScore: number;
  winnerId: Types.ObjectId | null;
  questionStartTime: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
}

const gameSessionSchema = new Schema<IGameSession>({
  hostId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  guestId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
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
  rounds: {
    type: Number,
    required: true,
    min: 1,
    max: 3,
  },
  questionsPerRound: {
    type: Number,
    default: 5,
  },
  status: {
    type: String,
    required: true,
    enum: ['waiting', 'in_progress', 'completed', 'cancelled'],
    default: 'waiting',
  },
  questions: {
    type: [gameQuestionSchema],
    default: [],
  },
  hostAnswers: {
    type: [answerSchema],
    default: [],
  },
  guestAnswers: {
    type: [answerSchema],
    default: [],
  },
  currentQuestionIndex: {
    type: Number,
    default: 0,
  },
  currentRound: {
    type: Number,
    default: 1,
  },
  hostScore: {
    type: Number,
    default: 0,
  },
  guestScore: {
    type: Number,
    default: 0,
  },
  winnerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  questionStartTime: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  startedAt: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from creation
  },
});

// Indexes for efficient queries
gameSessionSchema.index({ status: 1, createdAt: -1 });
gameSessionSchema.index({ hostId: 1, status: 1 });
gameSessionSchema.index({ guestId: 1, status: 1 });

const GameSession = model<IGameSession>('GameSession', gameSessionSchema);
export default GameSession;
