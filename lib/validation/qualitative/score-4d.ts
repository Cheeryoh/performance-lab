/**
 * Calls the Claude API to score a candidate's Claude Code usage on the 4D rubric.
 * Returns structured scores (0-25 each) + reasoning.
 *
 * Uses claude-sonnet-4-6 for speed and cost at demo scale.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface FourDScores {
  delegation: number    // 0-25
  description: number   // 0-25
  discernment: number   // 0-25
  diligence: number     // 0-25
  reasoning: string
}

const RUBRIC_SYSTEM = `You are an expert evaluator assessing a software engineer's ability to use Claude Code effectively. You will be shown a transcript of all Claude Code tool calls made during a timed coding exam. Score the candidate on the 4D rubric, 0-25 points each.

RUBRIC:

1. DELEGATION (0-25)
   Did the candidate delegate meaningful, appropriate tasks to Claude Code?
   High score: Uses Claude for substantial work (debugging, refactoring, test writing, searching).
   Low score: Only trivial uses (e.g., one echo command), or does everything manually.

2. DESCRIPTION (0-25)
   Were prompts specific, contextual, and well-scoped?
   High score: Prompts include relevant context, specific goals, constraints. Claude can act effectively.
   Low score: Vague one-liners ("fix this", "help"), no context, unclear intent.

3. DISCERNMENT (0-25)
   Did the candidate critically review Claude's output and push back on errors?
   High score: Verifies results, spots mistakes, asks Claude to revise, doesn't blindly accept.
   Low score: Accepts all output uncritically, no verification, no iteration on errors.

4. DILIGENCE (0-25)
   Did the candidate follow through — iterate, test their fix, check edge cases?
   High score: Tests the solution, iterates on failures, checks for regressions, thorough completion.
   Low score: Submits without testing, gives up early, skips verification steps.

Return ONLY valid JSON in this exact format:
{
  "delegation": <0-25>,
  "description": <0-25>,
  "discernment": <0-25>,
  "diligence": <0-25>,
  "reasoning": "<2-3 sentences explaining the scores>"
}`

export async function score4D(transcript: string): Promise<FourDScores> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: RUBRIC_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Here is the Claude Code tool usage transcript from the exam session:\n\n${transcript}\n\nScore this candidate on the 4D rubric.`,
      },
    ],
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`Claude returned no JSON: ${text}`)
  }

  const parsed = JSON.parse(jsonMatch[0])

  return {
    delegation: clamp(parsed.delegation),
    description: clamp(parsed.description),
    discernment: clamp(parsed.discernment),
    diligence: clamp(parsed.diligence),
    reasoning: String(parsed.reasoning ?? ''),
  }
}

function clamp(v: unknown): number {
  const n = Number(v)
  if (isNaN(n)) return 0
  return Math.max(0, Math.min(25, Math.round(n)))
}
