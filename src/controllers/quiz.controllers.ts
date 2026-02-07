import { Request, Response } from "express";
import StartNewQuiz from "../models/startnewquiz.model";
import { generateQuizQuestions } from "../services/openrouter";

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

// Helper to get start of day in local time
function getStartOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Helper to check if two dates are the same day
function isSameDay(date1: Date, date2: Date): boolean {
    return getStartOfDay(date1).getTime() === getStartOfDay(date2).getTime();
}

// Helper to check if date1 is exactly one day before date2
function isOneDayBefore(date1: Date, date2: Date): boolean {
    const d1 = getStartOfDay(date1);
    const d2 = getStartOfDay(date2);
    const diffMs = d2.getTime() - d1.getTime();
    return diffMs === 24 * 60 * 60 * 1000; // Exactly 1 day
}

export const getStreak = async (req: Request, res: Response) => {
    try {
        const today = new Date();
        const todayStart = getStartOfDay(today);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        console.log('[getStreak] Today:', today.toISOString());
        console.log('[getStreak] Today start:', todayStart.toISOString());

        // Get all completed quizzes sorted by completion date (most recent first)
        const completedQuizzes = await StartNewQuiz.find({ isCompleted: true })
            .sort({ completedAt: -1 })
            .select('completedAt correctCount questions');

        console.log('[getStreak] Found', completedQuizzes.length, 'completed quizzes');

        if (completedQuizzes.length === 0) {
            res.status(200).json({ 
                success: true, 
                data: { 
                    streak: 0, 
                    hasCompletedToday: false,
                    todayAverageScore: 0,
                    todayQuizCount: 0
                } 
            });
            return;
        }

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Debug: log first quiz's completedAt
        if (completedQuizzes.length > 0 && completedQuizzes[0].completedAt) {
            console.log('[getStreak] Most recent quiz completedAt:', completedQuizzes[0].completedAt);
        }

        // Calculate today's stats
        const todayQuizzes = completedQuizzes.filter(quiz => 
            quiz.completedAt && isSameDay(quiz.completedAt, today)
        );
        
        console.log('[getStreak] Today quizzes count:', todayQuizzes.length);

        let todayAverageScore = 0;
        if (todayQuizzes.length > 0) {
            const totalPercentage = todayQuizzes.reduce((sum, quiz) => {
                const percentage = quiz.questions.length > 0 
                    ? Math.round((quiz.correctCount / quiz.questions.length) * 100)
                    : 0;
                return sum + percentage;
            }, 0);
            todayAverageScore = Math.round(totalPercentage / todayQuizzes.length);
            console.log('[getStreak] Today average score:', todayAverageScore);
        }

        // Get unique dates (days) when quizzes were completed
        const uniqueDays: Date[] = [];
        completedQuizzes.forEach(quiz => {
            if (quiz.completedAt) {
                const quizDay = getStartOfDay(quiz.completedAt);
                // Only add if it's a new unique day
                if (!uniqueDays.some(d => d.getTime() === quizDay.getTime())) {
                    uniqueDays.push(quizDay);
                }
            }
        });

        // Sort unique days in descending order (most recent first)
        uniqueDays.sort((a, b) => b.getTime() - a.getTime());

        if (uniqueDays.length === 0) {
            res.status(200).json({ 
                success: true, 
                data: { 
                    streak: 0, 
                    hasCompletedToday: false,
                    todayAverageScore: 0,
                    todayQuizCount: 0
                } 
            });
            return;
        }

        const mostRecentDay = uniqueDays[0];
        const hasCompletedToday = isSameDay(mostRecentDay, today);
        const hasCompletedYesterday = isSameDay(mostRecentDay, yesterday);

        // If no quiz today or yesterday, streak is broken
        if (!hasCompletedToday && !hasCompletedYesterday) {
            res.status(200).json({ 
                success: true, 
                data: { 
                    streak: 0, 
                    hasCompletedToday: false,
                    todayAverageScore: 0,
                    todayQuizCount: 0
                } 
            });
            return;
        }

        // Count consecutive days starting from the most recent
        let streak = 1;
        for (let i = 1; i < uniqueDays.length; i++) {
            if (isOneDayBefore(uniqueDays[i], uniqueDays[i - 1])) {
                streak++;
            } else {
                break; // Streak broken
            }
        }

        res.status(200).json({ 
            success: true, 
            data: { 
                streak, 
                hasCompletedToday,
                todayAverageScore,
                todayQuizCount: todayQuizzes.length,
                lastCompletedDate: mostRecentDay.toISOString()
            } 
        });
    } catch (err) {
        console.error('[getStreak] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to calculate streak' });
    }
};

export const getMastery = async (req: Request, res: Response) => {
    try {
        // Get all completed quizzes
        const completedQuizzes = await StartNewQuiz.find({ isCompleted: true })
            .select('topic difficulty correctCount questions');

        if (completedQuizzes.length === 0) {
            res.status(200).json({ 
                success: true, 
                data: null 
            });
            return;
        }

        // Group quizzes by topic and calculate average score
        const topicStats: Record<string, { 
            totalPercentage: number; 
            count: number; 
            difficulties: string[];
        }> = {};

        completedQuizzes.forEach(quiz => {
            const topic = quiz.topic.toLowerCase().trim();
            const percentage = quiz.questions.length > 0 
                ? (quiz.correctCount / quiz.questions.length) * 100 
                : 0;

            if (!topicStats[topic]) {
                topicStats[topic] = { totalPercentage: 0, count: 0, difficulties: [] };
            }
            topicStats[topic].totalPercentage += percentage;
            topicStats[topic].count++;
            if (!topicStats[topic].difficulties.includes(quiz.difficulty)) {
                topicStats[topic].difficulties.push(quiz.difficulty);
            }
        });

        // Find topic with highest average score
        let bestTopic = '';
        let bestAverage = 0;
        let bestDifficulty = 'easy';
        let bestQuizCount = 0;

        for (const [topic, stats] of Object.entries(topicStats)) {
            const average = stats.totalPercentage / stats.count;
            if (average > bestAverage) {
                bestAverage = average;
                bestTopic = topic;
                bestQuizCount = stats.count;
                // Get the highest difficulty level achieved
                if (stats.difficulties.includes('hard')) {
                    bestDifficulty = 'hard';
                } else if (stats.difficulties.includes('medium')) {
                    bestDifficulty = 'medium';
                } else {
                    bestDifficulty = 'easy';
                }
            }
        }

        // Get display name (capitalize first letter of each word)
        const displayTopic = bestTopic
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        res.status(200).json({ 
            success: true, 
            data: {
                topic: displayTopic,
                averageScore: Math.round(bestAverage),
                difficulty: bestDifficulty,
                quizCount: bestQuizCount
            }
        });
    } catch (err) {
        console.error('[getMastery] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to get mastery data' });
    }
};

export const getProfileStats = async (req: Request, res: Response) => {
    try {
        // Get all completed quizzes
        const completedQuizzes = await StartNewQuiz.find({ isCompleted: true })
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

        // Calculate average mastery
        const totalPercentage = completedQuizzes.reduce((sum, quiz) => {
            const percentage = quiz.questions.length > 0
                ? (quiz.correctCount / quiz.questions.length) * 100
                : 0;
            return sum + percentage;
        }, 0);
        const averageMastery = Math.round(totalPercentage / totalCompletions);

        // Count unique topics
        const uniqueTopics = new Set(completedQuizzes.map(q => q.topic.toLowerCase().trim()));
        const topicsStudied = uniqueTopics.size;

        // Calculate streak
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const uniqueDays: Date[] = [];
        completedQuizzes.forEach(quiz => {
            if (quiz.completedAt) {
                const quizDay = getStartOfDay(quiz.completedAt);
                if (!uniqueDays.some(d => d.getTime() === quizDay.getTime())) {
                    uniqueDays.push(quizDay);
                }
            }
        });
        uniqueDays.sort((a, b) => b.getTime() - a.getTime());

        let currentStreak = 0;
        if (uniqueDays.length > 0) {
            const mostRecentDay = uniqueDays[0];
            const hasCompletedToday = isSameDay(mostRecentDay, today);
            const hasCompletedYesterday = isSameDay(mostRecentDay, yesterday);

            if (hasCompletedToday || hasCompletedYesterday) {
                currentStreak = 1;
                for (let i = 1; i < uniqueDays.length; i++) {
                    if (isOneDayBefore(uniqueDays[i], uniqueDays[i - 1])) {
                        currentStreak++;
                    } else {
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
                currentStreak
            }
        });
    } catch (err) {
        console.error('[getProfileStats] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to get profile stats' });
    }
};

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