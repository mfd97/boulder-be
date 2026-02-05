import { Request, Response } from "express";
import StartNewQuiz from "../models/startnewquiz.model";
import { generateQuizQuestions } from "../services/openrouter";

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export const createQuiz = async (req: Request, res: Response) => {
    console.log('[createQuiz] Request received:', req.body);
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
        const { questions } = await generateQuizQuestions(topic.trim(), difficulty);

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
        console.error('[createQuiz] Error:', message);
        console.error('[createQuiz] Full error:', err);

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