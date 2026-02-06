import { Request, Response } from "express";
import StartNewQuiz from "../models/startnewquiz.model";
import { generateQuizQuestions } from "../services/openrouter";

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export const getQuizHistory = async (req: Request, res: Response) => {
    try {
        // Only show completed quizzes in history
        const quizzes = await StartNewQuiz.find({ isCompleted: true })
            .sort({ completedAt: -1 }) // Most recent first
            .select('topic difficulty createdAt completedAt questions correctCount totalScore earnedScore');

        // Add summary info for each quiz
        const quizzesWithSummary = quizzes.map(quiz => ({
            _id: quiz._id,
            topic: quiz.topic,
            difficulty: quiz.difficulty,
            createdAt: quiz.createdAt,
            completedAt: quiz.completedAt,
            questionCount: quiz.questions.length,
            correctCount: quiz.correctCount,
            totalScore: quiz.totalScore,
            earnedScore: quiz.earnedScore,
            percentage: quiz.questions.length > 0
                ? Math.round((quiz.correctCount / quiz.questions.length) * 100)
                : 0,
        }));

        res.status(200).json({ success: true, data: quizzesWithSummary });
    } catch (err) {
        console.error('[getQuizHistory] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch quiz history' });
    }
};

export const submitQuizResult = async (req: Request, res: Response) => {
    const { quizId, answers, correctCount, totalScore, earnedScore } = req.body;

    if (!quizId) {
        res.status(400).json({ success: false, message: 'Quiz ID is required' });
        return;
    }

    try {
        const quiz = await StartNewQuiz.findByIdAndUpdate(
            quizId,
            {
                isCompleted: true,
                answers: answers || {},
                correctCount: correctCount || 0,
                totalScore: totalScore || 0,
                earnedScore: earnedScore || 0,
                completedAt: new Date(),
            },
            { new: true }
        );

        if (!quiz) {
            res.status(404).json({ success: false, message: 'Quiz not found' });
            return;
        }

        res.status(200).json({ success: true, data: quiz });
    } catch (err) {
        console.error('[submitQuizResult] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to save quiz result' });
    }
};

export const getQuizById = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const quiz = await StartNewQuiz.findById(id);

        if (!quiz) {
            res.status(404).json({ success: false, message: 'Quiz not found' });
            return;
        }

        res.status(200).json({ success: true, data: quiz });
    } catch (err) {
        console.error('[getQuizById] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch quiz' });
    }
};

export const createQuiz = async (req: Request, res: Response) => {
    const { topic, difficulty } = req.body;

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
        res.status(400).json({ success: false, message: 'Topic is required' });
        return;
    }
    if (!difficulty || !VALID_DIFFICULTIES.includes(difficulty)) {
        res.status(400).json({
            success: false,
            message: 'Difficulty is required and must be one of: easy, medium, hard',
        });
        return;
    }

    try {
        // Fetch previous questions for this topic to avoid repetition
        const previousQuizzes = await StartNewQuiz.find({
            topic: { $regex: new RegExp(`^${topic.trim()}$`, 'i') } // Case-insensitive match
        }).select('questions');

        // Extract all previous question texts
        const excludeQuestions: string[] = [];
        previousQuizzes.forEach(quiz => {
            quiz.questions.forEach(q => {
                if (q.question) {
                    excludeQuestions.push(q.question);
                }
            });
        });

        console.log(`[createQuiz] Found ${excludeQuestions.length} previous questions for topic: ${topic}`);

        // Generate new questions, passing the exclusion list
        const { questions } = await generateQuizQuestions(topic.trim(), difficulty, excludeQuestions);

        const quiz = await StartNewQuiz.create({
            topic: topic.trim(),
            difficulty,
            questions: questions.map((q) => ({
                question: q.question,
                options: q.options,
                correct_answer: q.correct_answer,
                score: q.score,
            })),
        });

        res.status(201).json({ success: true, data: quiz });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate quiz';

        if (message.includes('OPENROUTER_API_KEY')) {
            res.status(503).json({ success: false, message: 'Quiz generator is not configured' });
            return;
        }
        if (message.includes('OpenRouter API error') || message.includes('Invalid response from question generator')) {
            res.status(502).json({ success: false, message: 'Failed to generate questions. Please try again.' });
            return;
        }
        res.status(502).json({ success: false, message });
    }
};