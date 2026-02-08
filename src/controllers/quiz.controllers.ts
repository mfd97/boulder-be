import { Request, Response } from "express";
import StartNewQuiz from "../models/startnewquiz.model";
import { generateQuizQuestions } from "../services/openrouter";

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export const getQuizHistory = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        // Only show completed quizzes in history for this user
        const quizzes = await StartNewQuiz.find({ isCompleted: true, userId })
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
    const userId = req.user?._id;

    if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }

    if (!quizId) {
        res.status(400).json({ success: false, message: 'Quiz ID is required' });
        return;
    }

    try {
        // Only update if quiz belongs to the user
        const quiz = await StartNewQuiz.findOneAndUpdate(
            { _id: quizId, userId },
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
    const userId = req.user?._id;

    if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }

    try {
        // Only return quiz if it belongs to the user
        const quiz = await StartNewQuiz.findOne({ _id: id, userId });

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
    const userId = req.user?._id;

    if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }

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
        // Fetch previous questions for this topic to avoid repetition (only completed quizzes for this user)
        const previousQuizzes = await StartNewQuiz.find({
            userId,
            topic: { $regex: new RegExp(`^${topic.trim()}$`, 'i') },
            isCompleted: true
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

        console.log(`[createQuiz] Found ${excludeQuestions.length} previous questions for topic: ${topic} (user: ${userId})`);

        // Generate new questions, passing the exclusion list
        const { questions } = await generateQuizQuestions(topic.trim(), difficulty, excludeQuestions);

        const quiz = await StartNewQuiz.create({
            userId,
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

// Helper functions for date calculations
function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getYesterdayDateString(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return getLocalDateString(yesterday);
}

function getTodayDateString(): string {
    return getLocalDateString(new Date());
}

export const getStreak = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const completedQuizzes = await StartNewQuiz.find({ isCompleted: true, userId })
            .sort({ completedAt: -1 })
            .select('completedAt correctCount questions');

        if (completedQuizzes.length === 0) {
            res.status(200).json({
                success: true,
                data: {
                    streak: 0,
                    hasCompletedToday: false,
                    todayAverageScore: 0,
                    todayQuizCount: 0,
                    lastCompletedDate: null
                }
            });
            return;
        }

        // Group quizzes by date
        const quizzesByDate: Record<string, typeof completedQuizzes> = {};
        completedQuizzes.forEach(quiz => {
            if (quiz.completedAt) {
                const dateStr = getLocalDateString(new Date(quiz.completedAt));
                if (!quizzesByDate[dateStr]) {
                    quizzesByDate[dateStr] = [];
                }
                quizzesByDate[dateStr].push(quiz);
            }
        });

        const today = getTodayDateString();
        const yesterday = getYesterdayDateString();

        // Check if user completed a quiz today
        const todayQuizzes = quizzesByDate[today] || [];
        const hasCompletedToday = todayQuizzes.length > 0;

        // Calculate today's average score
        let todayAverageScore = 0;
        if (todayQuizzes.length > 0) {
            const totalPercentage = todayQuizzes.reduce((sum, quiz) => {
                const percentage = quiz.questions.length > 0
                    ? (quiz.correctCount / quiz.questions.length) * 100
                    : 0;
                return sum + percentage;
            }, 0);
            todayAverageScore = Math.round(totalPercentage / todayQuizzes.length);
        }

        // Calculate streak
        let streak = 0;
        const sortedDates = Object.keys(quizzesByDate).sort().reverse();

        // Streak must start from today or yesterday
        if (sortedDates.length > 0) {
            const mostRecentDate = sortedDates[0];

            if (mostRecentDate === today || mostRecentDate === yesterday) {
                // Count consecutive days
                let expectedDate = new Date(mostRecentDate);

                for (const dateStr of sortedDates) {
                    const currentDate = new Date(dateStr);
                    const expectedDateStr = getLocalDateString(expectedDate);

                    if (dateStr === expectedDateStr) {
                        streak++;
                        expectedDate.setDate(expectedDate.getDate() - 1);
                    } else if (currentDate < expectedDate) {
                        // Gap found, streak ends
                        break;
                    }
                }
            }
            // If most recent date is older than yesterday, streak is 0
        }

        res.status(200).json({
            success: true,
            data: {
                streak,
                hasCompletedToday,
                todayAverageScore,
                todayQuizCount: todayQuizzes.length,
                lastCompletedDate: sortedDates[0] || null
            }
        });
    } catch (err) {
        console.error('[getStreak] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch streak data' });
    }
};

export const getMastery = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const completedQuizzes = await StartNewQuiz.find({ isCompleted: true, userId })
            .select('topic difficulty correctCount questions');

        if (completedQuizzes.length === 0) {
            res.status(200).json({ success: true, data: null });
            return;
        }

        // Group by topic and calculate average score for each
        const topicStats: Record<string, { totalPercentage: number; count: number; latestDifficulty: string }> = {};

        completedQuizzes.forEach(quiz => {
            const topic = quiz.topic.toLowerCase();
            const percentage = quiz.questions.length > 0
                ? (quiz.correctCount / quiz.questions.length) * 100
                : 0;

            if (!topicStats[topic]) {
                topicStats[topic] = { totalPercentage: 0, count: 0, latestDifficulty: quiz.difficulty };
            }
            topicStats[topic].totalPercentage += percentage;
            topicStats[topic].count++;
            topicStats[topic].latestDifficulty = quiz.difficulty;
        });

        // Find the topic with the highest average score
        let topTopic = '';
        let highestAverage = 0;
        let topDifficulty = 'easy';

        for (const [topic, stats] of Object.entries(topicStats)) {
            const average = stats.totalPercentage / stats.count;
            if (average > highestAverage) {
                highestAverage = average;
                topTopic = topic;
                topDifficulty = stats.latestDifficulty;
            }
        }

        // Capitalize first letter of each word in topic
        const formattedTopic = topTopic
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        res.status(200).json({
            success: true,
            data: {
                topic: formattedTopic,
                averageScore: Math.round(highestAverage),
                difficulty: topDifficulty,
                quizCount: topicStats[topTopic]?.count || 0
            }
        });
    } catch (err) {
        console.error('[getMastery] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch mastery data' });
    }
};

export const getProfileStats = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }

        const completedQuizzes = await StartNewQuiz.find({ isCompleted: true, userId })
            .select('topic correctCount questions completedAt');

        const totalCompletions = completedQuizzes.length;

        if (totalCompletions === 0) {
            res.status(200).json({
                success: true,
                data: {
                    totalCompletions: 0,
                    averageMastery: 0,
                    topicsStudied: 0,
                    currentStreak: 0
                }
            });
            return;
        }

        // Calculate average mastery (average percentage across all quizzes)
        const totalPercentage = completedQuizzes.reduce((sum, quiz) => {
            const percentage = quiz.questions.length > 0
                ? (quiz.correctCount / quiz.questions.length) * 100
                : 0;
            return sum + percentage;
        }, 0);
        const averageMastery = Math.round(totalPercentage / totalCompletions);

        // Count unique topics
        const uniqueTopics = new Set(completedQuizzes.map(q => q.topic.toLowerCase()));
        const topicsStudied = uniqueTopics.size;

        // Calculate streak (reuse logic from getStreak)
        const quizzesByDate: Record<string, boolean> = {};
        completedQuizzes.forEach(quiz => {
            if (quiz.completedAt) {
                const dateStr = getLocalDateString(new Date(quiz.completedAt));
                quizzesByDate[dateStr] = true;
            }
        });

        const today = getTodayDateString();
        const yesterday = getYesterdayDateString();
        const sortedDates = Object.keys(quizzesByDate).sort().reverse();

        let streak = 0;
        if (sortedDates.length > 0) {
            const mostRecentDate = sortedDates[0];
            if (mostRecentDate === today || mostRecentDate === yesterday) {
                let expectedDate = new Date(mostRecentDate);
                for (const dateStr of sortedDates) {
                    const expectedDateStr = getLocalDateString(expectedDate);
                    if (dateStr === expectedDateStr) {
                        streak++;
                        expectedDate.setDate(expectedDate.getDate() - 1);
                    } else if (new Date(dateStr) < expectedDate) {
                        break;
                    }
                }
            }
        }

        res.status(200).json({
            success: true,
            data: {
                totalCompletions,
                averageMastery,
                topicsStudied,
                currentStreak: streak
            }
        });
    } catch (err) {
        console.error('[getProfileStats] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch profile stats' });
    }
};