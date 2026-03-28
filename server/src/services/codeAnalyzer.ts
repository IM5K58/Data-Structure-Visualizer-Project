import Groq from 'groq-sdk';

export type StructHint =
    | 'singly_linked_list'
    | 'doubly_linked_list'
    | 'circular_linked_list'
    | 'binary_tree'
    | 'nary_tree'
    | 'bst'
    | 'stack'
    | 'queue'
    | 'unknown';

export interface CodeAnalysis {
    structClassifications: Record<string, {
        hint: StructHint;
        suppressInternals: boolean;
    }>;
    confidence: number; // 0.0–1.0
}

const SYSTEM_PROMPT = `You are a C++ static analysis tool for a data structure visualizer.
Analyze the provided C++ code and return ONLY valid JSON — no markdown, no explanation, no code blocks.

Return exactly this schema:
{
  "structClassifications": {
    "<StructOrClassName>": {
      "hint": "<hint>",
      "suppressInternals": <boolean>
    }
  },
  "confidence": <0.0 to 1.0>
}

Valid hint values:
- "singly_linked_list": struct with one self-referencing pointer (next, link, etc.)
- "doubly_linked_list": struct with two self-referencing pointers (next+prev, etc.)
- "circular_linked_list": linked list where the last node points back to the head
- "binary_tree": struct with exactly two child pointers (left/right or similar)
- "nary_tree": struct with 3+ child pointers or an array of children
- "bst": binary search tree (binary_tree with ordering invariant)
- "stack": LIFO container (push/pop methods)
- "queue": FIFO container (enqueue/dequeue or push_back/pop_front methods)
- "unknown": cannot determine

suppressInternals rules:
- true for stack/queue: their internal node allocations should NOT be separately visualized
- false for all others: each allocated node IS a visual element

confidence: how certain you are overall (0.0 = total guess, 1.0 = obvious)`;

let client: Groq | null = null;

function getClient(): Groq | null {
    if (!process.env.GROQ_API_KEY) return null;
    if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return client;
}

// 프로세스 메모리 내 캐시 (서버 재시작 시 초기화, TTL 10분)
const analysisCache = new Map<string, { result: CodeAnalysis; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(code: string): CodeAnalysis | null {
    const entry = analysisCache.get(code);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        analysisCache.delete(code);
        return null;
    }
    return entry.result;
}

function setCache(code: string, result: CodeAnalysis): void {
    if (analysisCache.size > 200) {
        const now = Date.now();
        for (const [key, val] of analysisCache) {
            if (now > val.expiresAt) analysisCache.delete(key);
        }
    }
    analysisCache.set(code, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

function validate(obj: unknown): obj is CodeAnalysis {
    if (typeof obj !== 'object' || obj === null) return false;
    const a = obj as Record<string, unknown>;
    return (
        typeof a.structClassifications === 'object' &&
        a.structClassifications !== null &&
        typeof a.confidence === 'number'
    );
}

/**
 * Analyzes C++ code using Groq (llama-3.1-8b-instant) to determine struct/class types.
 * Returns null on any failure — callers fall back to regex-based classification.
 */
export async function analyzeCode(code: string): Promise<CodeAnalysis | null> {
    const groq = getClient();
    if (!groq) return null;

    const cached = getCached(code);
    if (cached) return cached;

    try {
        const result = await Promise.race([
            groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                max_tokens: 1024,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: code },
                ],
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Groq API timeout')), 8000)
            ),
        ]);

        const text = result.choices[0]?.message?.content ?? '';
        const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (!validate(parsed)) return null;
        setCache(code, parsed);
        return parsed;
    } catch (err) {
        console.warn('[codeAnalyzer] Groq API failed (using regex fallback):', (err as Error).message);
        return null;
    }
}

/**
 * Maps AI StructHint to the internal instrumenter hint type.
 */
export function mapHintToInternal(hint: StructHint): 'stack' | 'queue' | 'node' | 'tree' | undefined {
    switch (hint) {
        case 'binary_tree':
        case 'nary_tree':
        case 'bst':
            return 'tree';
        case 'singly_linked_list':
        case 'doubly_linked_list':
        case 'circular_linked_list':
            return 'node';
        case 'stack':
            return 'stack';
        case 'queue':
            return 'queue';
        default:
            return undefined;
    }
}
