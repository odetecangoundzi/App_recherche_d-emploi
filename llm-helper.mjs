/**
 * Shared Gemini helper for optional AI-assisted local scripts.
 *
 * Scripts keep deterministic fallbacks when GEMINI_API_KEY is absent, so the
 * career-ops CLI remains usable offline and in fresh setups.
 */

let dotenvLoaded = false;

async function loadEnv() {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  try {
    const { config } = await import('dotenv');
    config();
  } catch {
    // dotenv is optional; process.env still works.
  }
}

export async function createGeminiHelper(options = {}) {
  await loadEnv();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      available: false,
      reason: 'GEMINI_API_KEY absent',
      modelName: null,
      generateText: null,
    };
  }

  const modelName = options.modelName || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: options.temperature ?? 0.45,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
    },
  });

  return {
    available: true,
    reason: null,
    modelName,
    async generateText(parts) {
      const result = await model.generateContent(
        parts.map(part => typeof part === 'string' ? { text: part } : part)
      );
      return result.response.text().trim();
    },
  };
}

export function truncateText(text, maxChars = 4000) {
  if (!text || text.length <= maxChars) return text || '';
  return `${text.slice(0, maxChars)}\n\n[...truncated...]`;
}

export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const firstArray = candidate.indexOf('[');
  const firstObject = candidate.indexOf('{');
  const starts = [firstArray, firstObject].filter(i => i >= 0);
  if (starts.length === 0) return null;

  const start = Math.min(...starts);
  const open = candidate[start];
  const close = open === '[' ? ']' : '}';
  const end = candidate.lastIndexOf(close);
  if (end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
