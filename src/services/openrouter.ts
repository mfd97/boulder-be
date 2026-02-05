import * as fs from 'fs';
import * as path from 'path';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'tngtech/deepseek-r1t-chimera:free';

export interface GeneratedQuestion {
    question: string;
    options: [string, string, string];
    correct_answer: string;
    score: number;
}

export interface GenerateQuizQuestionsResult {
    topic: string;
    difficulty: string;
    questions: GeneratedQuestion[];
}

const DIFFICULTY_MAP: Record<string, string> = {
    easy: 'beginner',
    medium: 'intermediate',
    hard: 'advanced',
};

function loadPromptTemplate(): string {
    const promptPath = path.join(__dirname, '../../prompt.txt');
    return fs.readFileSync(promptPath, 'utf-8');
}

function buildPrompt(topic: string, difficulty: string): string {
    const template = loadPromptTemplate();
    const mappedDifficulty = DIFFICULTY_MAP[difficulty] ?? difficulty;
    return template
        .replace('<TOPIC FROM BODY></TOPIC>', topic)
        .replace('<DIFFICULTY FROM BODY></DIFFICULTY>', mappedDifficulty);
}

function isGeneratedQuestion(obj: unknown): obj is GeneratedQuestion {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as Record<string, unknown>;
    return (
        typeof o.question === 'string' &&
        Array.isArray(o.options) &&
        o.options.length === 3 &&
        o.options.every((opt: unknown) => typeof opt === 'string') &&
        typeof o.correct_answer === 'string' &&
        typeof o.score === 'number' &&
        o.score >= 1 &&
        o.score <= 5
    );
}

function validateAndNormalizeQuestions(raw: unknown): GeneratedQuestion[] {
    if (!Array.isArray(raw) || raw.length !== 5) {
        throw new Error('Invalid response from question generator: expected exactly 5 questions');
    }
    const questions: GeneratedQuestion[] = [];
    for (let i = 0; i < raw.length; i++) {
        if (!isGeneratedQuestion(raw[i])) {
            throw new Error(`Invalid response from question generator: invalid question at index ${i}`);
        }
        const q = raw[i];
        questions.push({
            question: q.question,
            options: q.options as [string, string, string],
            correct_answer: q.correct_answer,
            score: q.score,
        });
    }
    return questions;
}

export async function generateQuizQuestions(
    topic: string,
    difficulty: string
): Promise<GenerateQuizQuestionsResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey?.trim()) {
        throw new Error('OPENROUTER_API_KEY is not set');
    }

    const prompt = buildPrompt(topic, difficulty);

    console.log(prompt);

    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
            response_format: { type: 'json_object' },
        }),
    });

    console.log(response);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error('Invalid response from question generator: missing content');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('Invalid response from question generator: response is not valid JSON');
    }

    const obj = parsed as Record<string, unknown>;
    const questions = validateAndNormalizeQuestions(obj.questions);
    const resultTopic = typeof obj.topic === 'string' ? obj.topic : topic;
    const resultDifficulty = typeof obj.difficulty === 'string' ? obj.difficulty : difficulty;

    return {
        topic: resultTopic,
        difficulty: resultDifficulty,
        questions,
    };
}
