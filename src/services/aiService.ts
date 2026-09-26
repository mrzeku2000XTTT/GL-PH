import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client if API key is provided
let aiClient: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey =
      (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
      '';
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        aiClient = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.warn('Failed to initialize GoogleGenAI with key:', err);
      }
    }
  }
  return aiClient;
}

/**
 * Real or simulated AI execution using the pattern described by the user:
 *
 * async function askAI(prompt) {
 *   startThinkingAnimation();
 *   try {
 *     const response = await callAI(prompt);
 *     return response;
 *   } finally {
 *     stopThinkingAnimation();
 *   }
 * }
 */
export async function callAI(
  prompt: string,
  options?: { simulatedDurationMs?: number; signal?: AbortSignal }
): Promise<string> {
  const client = getAiClient();

  // If client is available and not in explicit simulation mode, call Gemini Flash
  if (client && (!options?.simulatedDurationMs || options.simulatedDurationMs === 0)) {
    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text || 'AI response received.';
    } catch (err: any) {
      console.warn('Gemini API call failed, falling back to realistic simulated response:', err);
    }
  }

  // Simulated AI with realistic delay of unknown duration
  const delayMs = options?.simulatedDurationMs ?? Math.floor(2500 + Math.random() * 3500);

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve(
        `Synthesized analytical response for: "${prompt}"\n\n` +
          `• The continuous radial wave and OKLab gradients visualize the model's internal attention weight distribution.\n` +
          `• Execution completed in ${(delayMs / 1000).toFixed(1)}s of seamless thinking time.\n` +
          `• Notice how the animation never snapped or looped a fixed 4-second timeline.`
      );
    }, delayMs);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('AI request was cancelled by user.'));
      });
    }
  });
}
