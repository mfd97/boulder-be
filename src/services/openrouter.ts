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
    'arcee-ai/trinity-large-preview:free'
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

    // If there are exclusions, add them at the START of the prompt (limit to last 10 so the model isn't overwhelmed)
    let exclusionPrefix = '';
    if (excludeQuestions && excludeQuestions.length > 0) {
        const recentExclusions = excludeQuestions.slice(-10);
        exclusionPrefix = `CRITICAL: The following questions have ALREADY been asked. Your output must contain ZERO questions that are the same or rephrased versions of these. Every new question must be on a different concept, subtopic, or angle (e.g. different definition, scenario, or application). Rephrasing or copying will cause rejection.

=== PREVIOUSLY ASKED QUESTIONS (DO NOT REPEAT IN ANY FORM) ===
${recentExclusions.map((q, i) => `${i + 1}. "${q}"`).join('\n')}
=== END OF EXCLUSION LIST ===

Generate 12 NEW questions about "${topic}" that do NOT appear above in any form. Vary question types: include different subtopics, definitions, applications, and scenarios.

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

const QUESTIONS_REQUIRED = 5;

function validateAndNormalizeQuestions(raw: unknown): GeneratedQuestion[] {
    if (!Array.isArray(raw) || raw.length < QUESTIONS_REQUIRED) {
        throw new Error(`Invalid response from question generator: expected at least ${QUESTIONS_REQUIRED} questions, got ${Array.isArray(raw) ? raw.length : 0}`);
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

// Filter out only exact duplicates (normalized text matches an excluded question)
function filterDuplicateQuestions(
    questions: GeneratedQuestion[],
    excludeQuestions: string[]
): GeneratedQuestion[] {
    const normalizedExclusions = new Set(excludeQuestions.map(q => normalizeForComparison(q)));

    return questions.filter(q => {
        const normalizedQ = normalizeForComparison(q.question);
        if (normalizedExclusions.has(normalizedQ)) {
            console.log(`[OpenRouter] Filtering exact duplicate: "${q.question.substring(0, 50)}..."`);
            return false;
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

    // Post-generation filter: remove exact duplicates of excluded questions
    if (excludeQuestions && excludeQuestions.length > 0) {
        const beforeFilter = questions;
        questions = filterDuplicateQuestions(questions, excludeQuestions);

        if (questions.length < beforeFilter.length) {
            console.log(`[OpenRouter] Filtered ${beforeFilter.length - questions.length} duplicate questions, ${questions.length} remaining`);
        }

        // Fallback: if filtering removed everything, use first N from the unfiltered list so the user still gets a quiz
        if (questions.length < QUESTIONS_REQUIRED) {
            console.warn(`[OpenRouter] Only ${questions.length} unique after filter; using first ${QUESTIONS_REQUIRED} from generated list (may include repeats).`);
            questions = beforeFilter.slice(0, QUESTIONS_REQUIRED);
        }
    }

    // Take only the number we need for the quiz
    questions = questions.slice(0, QUESTIONS_REQUIRED);

    if (questions.length < QUESTIONS_REQUIRED) {
        console.warn(`[OpenRouter] Only ${questions.length} questions available; need ${QUESTIONS_REQUIRED}.`);
        throw new Error("Couldn't generate enough questions for this topic.");
    }

    return {
        topic: resultTopic,
        difficulty: resultDifficulty,
        questions,
    };
}
