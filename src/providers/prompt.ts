import type { PromptPayload } from '@/pipeline/types'

// Shared, provider-independent prompt construction. Every adapter sends the same
// instruction so explanations are consistent regardless of the chosen model.

export const SYSTEM_PROMPT =
  'You are Linglens. Explain what a selected term means in the context of the ' +
  'specific document it appears in — like a knowledgeable colleague, not a dictionary. ' +
  'Use the document summary and the local section to ground the meaning. Write in ' +
  'plain language and do not restate the whole document.'

// Length instruction per verbosity, appended to the user prompt so the same
// system prompt serves both modes.
const LENGTH_INSTRUCTION: Record<PromptPayload['verbosity'], string> = {
  concise: 'Keep it to 1-2 short sentences — just the core meaning.',
  detailed:
    'Write a full explanation of about 4-6 sentences, adding a concrete example if it helps.',
}

/** Provider-independent chat message; each wire maps roles to its own format. */
export interface WireMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * The full conversation for one call. A first explanation is a single user
 * message; a follow-up replays the grounding prompt, the original explanation,
 * and prior turns so the (stateless) provider sees the whole thread.
 */
export function buildMessages(p: PromptPayload): WireMessage[] {
  const messages: WireMessage[] = [{ role: 'user', content: buildUserPrompt(p) }]
  if (!p.followUp) return messages

  messages.push({ role: 'assistant', content: p.followUp.explanation })
  for (const turn of p.followUp.turns) {
    messages.push({ role: 'user', content: turn.question })
    messages.push({ role: 'assistant', content: turn.answer })
  }
  messages.push({
    role: 'user',
    content:
      `${p.followUp.question}\n` +
      `(Answer the follow-up about "${p.term}" grounded in the same document, in ${p.targetLang}. ` +
      `${LENGTH_INSTRUCTION[p.verbosity]})`,
  })
  return messages
}

export function buildUserPrompt(p: PromptPayload): string {
  const outline = p.summary.outline.length
    ? p.summary.outline.map((h) => `- ${h}`).join('\n')
    : '(no headings)'

  return [
    `Document title: ${p.summary.title || '(untitled)'}`,
    '',
    'Document outline:',
    outline,
    '',
    'Document topic:',
    p.summary.topic || '(none)',
    '',
    `Local section${p.localContext.heading ? ` — "${p.localContext.heading}"` : ''}:`,
    p.localContext.text || '(none)',
    '',
    `Selected term: "${p.term}"`,
    '',
    `Explain the selected term in the context of THIS document. Write the explanation in ${p.targetLang}.`,
    LENGTH_INSTRUCTION[p.verbosity],
  ].join('\n')
}
