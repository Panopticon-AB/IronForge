import { GoogleGenAI, Type } from '@google/genai';
import type { IntervalsWellness, Session, TTBIndices } from '../types';
import { StorageService as Storage } from './storage';

function formatTtbScore(score: number | null): string {
  return score === null ? 'unknown' : String(score);
}

function formatLowestTtb(lowest: TTBIndices['lowest']): string {
  return lowest === null ? 'unknown (insufficient complete TTB evidence)' : lowest;
}

// The Spirit Guide Service
// Uses Gemini to act as an AI Coach with RAG context
export const GeminiService = {
  async consultSpiritGuide(
    wellness: IntervalsWellness,
    ttb: TTBIndices,
    _recentPrs: string[]
  ): Promise<Session | null> {
    if (!process.env.API_KEY) {
      console.warn('Gemini API Key missing. Spirit Guide dormant.');
      return null;
    }

    // --- RAG STEP: Retrieve Context ---
    const history = await Storage.getHistory();
    const recentLogs = history
      .slice(-20)
      .map((h) => `Date: ${h.date.split('T')[0]}, Exercise: ${h.exerciseId}, e1RM: ${h.e1rm}kg`)
      .join('\n');

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const strengthLabel = formatTtbScore(ttb.strength);
    const enduranceLabel = formatTtbScore(ttb.endurance);
    const wellnessLabel = formatTtbScore(ttb.wellness);
    const lowestLabel = formatLowestTtb(ttb.lowest);

    const prompt = `
            You are The Spirit Guide, an elite strength and conditioning coach for a "Titan" (athlete).
            
            Current Stats:
            - Body Battery: ${wellness.bodyBattery}/100
            - Sleep Score: ${wellness.sleepScore}/100
            - TTB Balance: Strength ${strengthLabel}, Endurance ${enduranceLabel}, Wellness ${wellnessLabel}
            - Lowest Stat: ${lowestLabel}
            
            Recent Training History (Last 20 Logs):
            ${recentLogs}

            Task: Generate a JSON workout Session while respecting measured recovery and recent training history.
            Never interpret an unknown TTB score as a low score. Only target the lowest TTB stat when Lowest Stat is known.
            If measured Wellness is low, generate an Active Recovery session.
            If Strength is the known lowest stat, look at the history and target a movement that hasn't been trained recently.
            If Endurance is the known lowest stat, generate a Cardio session.
            If Lowest Stat is unknown, choose conservatively from measured evidence rather than inventing a deficit.
            
            Flavor: Use RPG terminology (Quest, Boss, Loot).
        `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              zoneName: { type: Type.STRING },
              difficulty: { type: Type.STRING }, // Normal, Heroic, Mythic
              blocks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    type: { type: Type.STRING }, // warmup, station, transition, cooldown
                    exercises: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING },
                          name: { type: Type.STRING },
                          logic: { type: Type.STRING },
                          sets: {
                            type: Type.ARRAY,
                            items: {
                              type: Type.OBJECT,
                              properties: {
                                id: { type: Type.STRING },
                                reps: { type: Type.STRING }, // Can be number or string
                                completed: { type: Type.BOOLEAN },
                                weightPct: {
                                  type: Type.NUMBER,
                                  nullable: true,
                                },
                              },
                            },
                          },
                          instructions: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const sessionData = JSON.parse(response.text || '{}');

      return {
        ...sessionData,
        isGenerated: true,
      } as Session;
    } catch (error) {
      console.error('The Spirit Guide is silent (Gemini Error):', error);
      return null;
    }
  },

  async generateOracleAdvice(context: {
    priority: string;
    trigger: string;
    wellness: IntervalsWellness;
    data?: unknown; // e.g. TTB, Auditor findings
  }): Promise<string> {
    if (!process.env.API_KEY) return 'The Spirits are silent (No API Key).';

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
            You are The Oracle, a mystical but scientific strength coach. 
            Write a short, punchy rationale (max 2 sentences) for a workout recommendation.
            
            Context:
            - Trigger: ${context.priority} (${context.trigger})
            - Wellness: Body Battery ${context.wellness.bodyBattery}, Sleep ${context.wellness.sleepScore}
            - Data: ${JSON.stringify(context.data)}

            Style: Epic, stern, vaguely fantasy but grounded in sports science. Use terms like "Titan", "System", "Load", "Adaptation".
            Example: "Your nervous system is shattered. We must rebuild the foundation before adding load."
        `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
      });
      return response.text || 'The Oracle nods in silence.';
    } catch (e) {
      console.error('Oracle Generation Error', e);
      return 'The Oracle focuses on the data.';
    }
  },

  /**
   * Generates a full 7-day training plan based on user constraints and physiology.
   */
  async generateWeeklyPlanAI(
    userProfile: {
      heroName: string;
      level: number;
      trainingPath: string;
      equipment: string[];
      injuries: string[];
    },
    context: {
      wellness: IntervalsWellness;
      ttb: TTBIndices;
      intent: string; // e.g. "Hypertrophy", "Strength", "Peak Week"
      daysPerWeek: number;
    }
  ): Promise<any> {
    if (!process.env.API_KEY) throw new Error('No API Key');

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const bodyBattery = context.wellness.bodyBattery;
    const bodyBatteryLabel = typeof bodyBattery === 'number' ? String(bodyBattery) : 'unknown';
    const strengthBalanceLabel = formatTtbScore(context.ttb.strength);

    const prompt = `
            You are The Iron Oracle, creating a 7-day training program for a specific Titan.

            User Profile:
            - Hero: ${userProfile.heroName} (Level ${userProfile.level})
            - Path: ${userProfile.trainingPath}
            - Equipment: ${userProfile.equipment.join(', ')}
            - Injuries: ${userProfile.injuries.join(', ') || 'None'}

            Context:
            - Intent: ${context.intent}
            - Frequency: ${context.daysPerWeek} days/week
            - Physiology: Body Battery ${bodyBatteryLabel}, Strength Balance ${strengthBalanceLabel}

            Directives:
            1. Generate a 7-day plan (Monday-Sunday).
            2. Respect the 'daysPerWeek' constraint - assign "Rest Day" to others.
            3. progressive overload principles appropriate for the '${context.intent}'.
            4. Adjust volume from measured recovery evidence. If Body Battery is measured and < 30, force deload. If Body Battery is unknown, do not infer healthy recovery or increase load because data is missing; keep difficulty at Normal or easier and use conservative volume.
            5. Never interpret an unknown TTB balance as a low score or training deficit. Use only measured/derived evidence to justify extra work.

            Output JSON Schema:
            {
                "weekRationale": "Brief explanation of the microcycle focus...",
                "days": [
                    {
                        "dayOfWeek": 0 (Mon) to 6 (Sun),
                        "focus": "Legs / Push / Rest",
                        "isRestDay": boolean,
                        "session": {
                             "name": "Session Title",
                             "difficulty": "Normal | Heroic | Mythic",
                             "blocks": [ ... standard Session Block / Exercise structure ... ]
                        } (or null if rest)
                    }
                ]
            }
        `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              weekRationale: { type: Type.STRING },
              days: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dayOfWeek: { type: Type.NUMBER },
                    focus: { type: Type.STRING },
                    isRestDay: { type: Type.BOOLEAN },
                    session: {
                      type: Type.OBJECT,
                      nullable: true,
                      properties: {
                        id: { type: Type.STRING },
                        name: { type: Type.STRING },
                        zoneName: { type: Type.STRING },
                        difficulty: { type: Type.STRING },
                        blocks: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              id: { type: Type.STRING },
                              name: { type: Type.STRING },
                              type: { type: Type.STRING },
                              exercises: {
                                type: Type.ARRAY,
                                items: {
                                  type: Type.OBJECT,
                                  properties: {
                                    id: { type: Type.STRING },
                                    name: { type: Type.STRING },
                                    logic: { type: Type.STRING },
                                    sets: {
                                      type: Type.ARRAY,
                                      items: {
                                        type: Type.OBJECT,
                                        properties: {
                                          id: { type: Type.STRING },
                                          reps: { type: Type.STRING },
                                          weightPct: {
                                            type: Type.NUMBER,
                                            nullable: true,
                                          },
                                        },
                                      },
                                    },
                                    instructions: {
                                      type: Type.ARRAY,
                                      items: { type: Type.STRING },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      return JSON.parse(response.text || '{}');
    } catch (error) {
      console.error('Gemini Planning Error:', error);
      throw error;
    }
  },

  /**
   * Standard Chat Interface for the Oracle.
   */
  async chat(
    message: string,
    history: { role: string; content: string }[],
    bioContext: string
  ): Promise<string> {
    if (!process.env.API_KEY) return 'The Spirits are silent (No API Key).';

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Construct conversation history with correctly typed roles
    const contents = history.map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    }));

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const systemInstruction = `You are The Oracle, a mystical but scientifically grounded AI coach for IronForge.
      Context on the Titan (User):
      ${bioContext}
      
      Guidelines:
      1. Stay in character: mystical, stern, scientific.
      2. Keep responses punchy and focused on training.
      3. Use RPG terminology (Experience, Stamina, Quests) where appropriate.
      4. Reference their bio-context if it explains why you recommend something.`;

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
        },
      });
      return result.text || 'The Oracle remains silent.';
    } catch (e) {
      console.error('Oracle Chat Error:', e);
      return 'The connection to the Oracle is unstable.';
    }
  },
};
