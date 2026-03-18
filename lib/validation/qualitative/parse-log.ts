/**
 * Transforms raw JSONB log_events (Claude Code PostToolUse hook payloads)
 * into a human-readable conversation transcript for the 4D scoring prompt.
 */

interface HookEvent {
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_response?: unknown
  _received_at?: string
  [key: string]: unknown
}

export interface TranscriptTurn {
  timestamp: string
  tool: string
  input: string
  output: string
}

export function parseLogToTranscript(logEvents: HookEvent[]): TranscriptTurn[] {
  return logEvents.map((event, i) => {
    const tool = event.tool_name ?? event['tool'] as string ?? 'unknown'
    const timestamp = event._received_at ?? `event-${i}`

    // Serialize input concisely
    const inputObj = event.tool_input ?? event['input']
    const input = typeof inputObj === 'string'
      ? inputObj
      : JSON.stringify(inputObj, null, 0).slice(0, 500)

    // Serialize response concisely
    const responseObj = event.tool_response ?? event['response'] ?? event['output']
    const output = typeof responseObj === 'string'
      ? responseObj.slice(0, 500)
      : JSON.stringify(responseObj, null, 0).slice(0, 500)

    return { timestamp, tool, input, output }
  })
}

export function formatTranscriptForPrompt(turns: TranscriptTurn[]): string {
  if (turns.length === 0) return '(no tool use events recorded)'

  return turns
    .map(
      (t, i) =>
        `[${i + 1}] ${t.tool} @ ${t.timestamp}\n` +
        `  INPUT: ${t.input}\n` +
        `  OUTPUT: ${t.output}`,
    )
    .join('\n\n')
}
