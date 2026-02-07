import * as fs from 'fs';
import * as path from 'path';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Fallback models in order of preference (speed & reliability)
const FALLBACK_MODELS = [
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen-2-7b-instruct:free',
    'tngtech/deepseek-r1t-chimera:free',
];

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

function buildPrompt(topic: string, difficulty: string, excludeQuestions?: string[]): string {
    const template = loadPromptTemplate();
    const mappedDifficulty = DIFFICULTY_MAP[difficulty] ?? difficulty;

    // If there are exclusions, add them at the START of the prompt for better adherence
    let exclusionPrefix = '';
    if (excludeQuestions && excludeQuestions.length > 0) {
        exclusionPrefix = `CRITICAL INSTRUCTION - YOU MUST AVOID THESE QUESTIONS:
The user has already been asked the following questions. DO NOT generate any questions that are similar to these:

=== PREVIOUSLY ASKED QUESTIONS (DO NOT REPEAT) ===
${excludeQuestions.map((q, i) => `${i + 1}. "${q}"`).join('\n')}
=== END OF EXCLUSION LIST ===

You MUST create COMPLETELY NEW questions about "${topic}" that are DIFFERENT from the above. Ask about different concepts, use different scenarios, or test different aspects of the topic.

---

`;
    }

    let prompt = exclusionPrefix + template
        .replace('<TOPIC FROM BODY></TOPIC>', topic)
        .replace('<DIFFICULTY FROM BODY></DIFFICULTY>', mappedDifficulty);

    return prompt;
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

// Normalize a question string for comparison (lowercase, remove punctuation, trim whitespace)
function normalizeForComparison(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
}

// Calculate similarity between two strings (simple word overlap)
function calculateSimilarity(str1: string, str2: string): number {
    const norm1 = normalizeForComparison(str1);
    const norm2 = normalizeForComparison(str2);

    // Exact match
    if (norm1 === norm2) return 1.0;

    // Word-based overlap
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));

    let overlap = 0;
    words1.forEach(word => {
        if (words2.has(word)) overlap++;
    });

    // Jaccard similarity
    const union = new Set([...words1, ...words2]).size;
    return union > 0 ? overlap / union : 0;
}

// Filter out questions that are too similar to excluded ones
function filterDuplicateQuestions(
    questions: GeneratedQuestion[],
    excludeQuestions: string[],
    similarityThreshold: number = 0.7
): GeneratedQuestion[] {
    const normalizedExclusions = excludeQuestions.map(q => normalizeForComparison(q));

    return questions.filter(q => {
        const normalizedQ = normalizeForComparison(q.question);

        for (const excluded of normalizedExclusions) {
            const similarity = calculateSimilarity(normalizedQ, excluded);
            if (similarity >= similarityThreshold) {
                console.log(`[OpenRouter] Filtering duplicate question (${Math.round(similarity * 100)}% similar): "${q.question.substring(0, 50)}..."`);
                return false;
            }
        }
        return true;
    });
}

// Try a single model and return result or throw error
async function tryModel(
    model: string,
    prompt: string,
    apiKey: string
): Promise<{ content: string }> {
    console.log(`[OpenRouter] Trying model: ${model}`);

    const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Model ${model} failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error(`Model ${model} returned invalid response: missing content`);
    }

    console.log(`[OpenRouter] Success with model: ${model}`);
    return { content };
}

export async function generateQuizQuestions(
    topic: string,
    difficulty: string,
    excludeQuestions?: string[]
): Promise<GenerateQuizQuestionsResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey?.trim()) {
        throw new Error('OPENROUTER_API_KEY is not set');
    }

    const prompt = buildPrompt(topic, difficulty, excludeQuestions);
    console.log('[OpenRouter] Generated prompt for topic:', topic);
    if (excludeQuestions && excludeQuestions.length > 0) {
        console.log(`[OpenRouter] Excluding ${excludeQuestions.length} previous questions`);
    }

    // Get models to try - use env override or fallback list
    const envModel = process.env.OPENROUTER_MODEL;
    const modelsToTry = envModel ? [envModel, ...FALLBACK_MODELS] : FALLBACK_MODELS;

    let lastError: Error | null = null;
    let content: string | null = null;

    // Try each model until one succeeds
    for (const model of modelsToTry) {
        try {
            const result = await tryModel(model, prompt, apiKey);
            content = result.content;
            break; // Success - exit loop
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.warn(`[OpenRouter] ${lastError.message}`);
            // Continue to next model
        }
    }

    if (!content) {
        throw new Error(`All models failed. Last error: ${lastError?.message}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('Invalid response from question generator: response is not valid JSON');
    }

    const obj = parsed as Record<string, unknown>;
    let questions = validateAndNormalizeQuestions(obj.questions);
    const resultTopic = typeof obj.topic === 'string' ? obj.topic : topic;
    const resultDifficulty = typeof obj.difficulty === 'string' ? obj.difficulty : difficulty;

    // Post-generation filter: remove any questions that are too similar to excluded ones
    if (excludeQuestions && excludeQuestions.length > 0) {
        const originalCount = questions.length;
        questions = filterDuplicateQuestions(questions, excludeQuestions);

        if (questions.length < originalCount) {
            console.log(`[OpenRouter] Filtered ${originalCount - questions.length} duplicate questions, ${questions.length} remaining`);
        }

        // If too many questions were filtered, log a warning
        if (questions.length < 3) {
            console.warn(`[OpenRouter] Warning: Only ${questions.length} unique questions generated. Consider expanding the topic or reducing exclusions.`);
        }
    }

    return {
        topic: resultTopic,
        difficulty: resultDifficulty,
        questions,
    };
}
