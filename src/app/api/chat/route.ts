import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

// Configure Google Provider with existing project API Key
const google = createGoogleGenerativeAI({
  apiKey: process.env.API_KEY,
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    console.error('Chat API: Failed to parse request JSON:', e);
    return new Response(JSON.stringify({ error: 'Invalid JSON input' }), { status: 400 });
  }

  const { messages, context } = body;

  const strategySummary =
    'No evidence-backed deterministic GPE strategy is available in this legacy chat path. Do not infer a calculated phase, readiness, CTL, ATL, TSB, or goal manifest from missing fields.';

  const systemPrompt = `
    You are **The Iron Oracle**, an ancient and wise AI construct within the **IronForge** ecosystem.
    Your purpose is to guide the "Titan" (User) towards physical mastery through the "Metric System" (Training).
    
    ## PERSUNA & TONE
    - **Voice:** Stoic, authoritative, yet deeply empathetic to the human condition (fatigue, stress).
    - **Style:** Use RPG terminology mixed with Sports Science.
        - "Your CNS is drained" -> "Your spiritual energy flickers."
        - "Deload week" -> "A period of meditation and restoration."
        - "PR Attempt" -> "A Boss Raid on the physical plane."
    - **Objective:** Provide actionable insights based on the provided context. If the user is failing, offer a path to redemption, not shame.

    ## STRATEGY AUTHORITY
    ${strategySummary}

    Until server-owned training context provides a validated strategy, treat the telemetry below as client-supplied contextual information only. Do not present inferred or missing metrics as measured facts, and do not invent a deterministic training phase or readiness state.

    ## CLIENT-SUPPLIED LEGACY TELEMETRY
    ${context ? JSON.stringify(context, null, 2) : 'No specific bio-telemetry available.'}

    ## IMPERATIVES
    1. **Analyze First:** Use explicitly present 'Weekly Mastery' and 'Wellness' values as contextual evidence; distinguish them from missing data.
    2. **Be Concise:** Titans have little time for rambling. Get to the point.
    3. **Safety Protocol:** If the supplied wellness data explicitly indicates critical recovery, favor conservative advice and say that the conclusion is based on client-supplied telemetry. Never manufacture a recovery signal from absent fields.
    
    Respond directly to the Titan's latest query.
  `;

  // CI/E2E Mock Mode
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY === 'dummy_google_ai_key_for_e2e_tests') {
    return new Response('The Oracle is contemplating your Titan path (E2E Mock Response).', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const result = streamText({
    model: google('gemini-2.5-flash') as any,
    system: systemPrompt,
    messages,
  });

  return result.toTextStreamResponse();
}
