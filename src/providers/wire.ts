import type { PromptPayload } from '@/pipeline/types'
import type { ProviderConfig, TokenUsage } from './types'
import { ProviderError } from './types'
import { SYSTEM_PROMPT, buildMessages } from './prompt'
import { errorFromStatus } from './errors'
import type { ProviderCall } from './call'
import type { StreamSpec } from './stream'

// Wire formats: the on-the-network request/response shapes a provider speaks.
// A provider descriptor names a wire + a base URL; the wire knows how to turn
// (baseUrl, model, apiKey, payload) into a request and pull text back out. Each
// wire supplies both a buffered ProviderCall (WIRES) and a streaming StreamSpec
// (STREAM_WIRES) built from the same request so the two can't drift. Most
// providers are OpenAI-compatible and share the 'openai' wire — adding one is
// then just a data entry (see registry.ts), no new code.

export type Wire = 'openai' | 'anthropic' | 'gemini'

/** Build the buffered request/response plumbing for a wire bound to a base URL. */
export type WireBuilder = (baseUrl: string, payload: PromptPayload) => ProviderCall

/** Build the streaming plumbing for a wire bound to a base URL. */
export type StreamWireBuilder = (baseUrl: string, payload: PromptPayload) => StreamSpec

interface OpenAIResponse {
  choices?: { message?: { content?: string }; delta?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}
interface AnthropicResponse {
  content?: { text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}
interface AnthropicStreamEvent {
  type?: string
  delta?: { text?: string }
  /** message_start carries usage nested in the message; message_delta at top level. */
  message?: { usage?: { input_tokens?: number; output_tokens?: number } }
  usage?: { output_tokens?: number }
}
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

// --- Usage extractors. Only real provider-reported numbers are surfaced; a
// missing field yields undefined rather than a guess.

function openaiUsage(data: unknown) {
  const u = (data as OpenAIResponse).usage
  return u?.prompt_tokens !== undefined && u?.completion_tokens !== undefined
    ? { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens }
    : undefined
}

function anthropicUsage(data: unknown) {
  const u = (data as AnthropicResponse).usage
  return u?.input_tokens !== undefined && u?.output_tokens !== undefined
    ? { inputTokens: u.input_tokens, outputTokens: u.output_tokens }
    : undefined
}

/** Anthropic splits stream usage: input arrives on message_start, the final
 * (cumulative) output count on message_delta. Partials merge in streamProvider. */
function anthropicStreamUsage(data: unknown) {
  const e = data as AnthropicStreamEvent
  if (e.type === 'message_start') {
    const u = e.message?.usage
    return u ? { inputTokens: u.input_tokens, outputTokens: u.output_tokens } : undefined
  }
  if (e.type === 'message_delta') {
    const out = e.usage?.output_tokens
    return out !== undefined ? { outputTokens: out } : undefined
  }
  return undefined
}

function geminiUsage(data: unknown) {
  const u = (data as GeminiResponse).usageMetadata
  return u?.promptTokenCount !== undefined && u?.candidatesTokenCount !== undefined
    ? { inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount }
    : undefined
}

/** Gemini reports usageMetadata per chunk; report fields individually so the
 * later (final) chunk's values win in the merge. */
function geminiStreamUsage(data: unknown) {
  const u = (data as GeminiResponse).usageMetadata
  if (!u) return undefined
  return { inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount }
}

const ANTHROPIC_VERSION = '2023-06-01'

/** Gemini returns 400 (not 401) for an invalid key, distinguished by message. */
function geminiError(status: number, body: string): ProviderError {
  if (status === 400 && /api[_ ]?key/i.test(body)) {
    return new ProviderError('invalid-key', 'Your API key was rejected. Check it in Linglens settings.')
  }
  return errorFromStatus(status)
}

// --- Request builders, shared by the buffered + streaming variants of each wire.
// `stream` toggles the provider's streaming mode (SSE); everything else is equal.

function openaiRequest(baseUrl: string, payload: PromptPayload, c: ProviderConfig, stream: boolean) {
  return {
    url: `${baseUrl}/chat/completions`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model,
        temperature: 0.2,
        stream,
        // Ask for usage on the final stream chunk (OpenAI needs the opt-in;
        // compatible servers either honor or ignore it).
        ...(stream ? { stream_options: { include_usage: true } } : {}),
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...buildMessages(payload)],
      }),
    },
  }
}

function anthropicRequest(baseUrl: string, payload: PromptPayload, c: ProviderConfig, stream: boolean) {
  return {
    url: `${baseUrl}/v1/messages`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': c.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        // Required for direct calls from a browser/extension context.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: c.model,
        max_tokens: 1024,
        temperature: 0.2,
        stream,
        system: SYSTEM_PROMPT,
        messages: buildMessages(payload),
      }),
    },
  }
}

function geminiRequest(baseUrl: string, payload: PromptPayload, c: ProviderConfig, stream: boolean) {
  const method = stream ? 'streamGenerateContent' : 'generateContent'
  const query = stream ? '&alt=sse' : ''
  return {
    url: `${baseUrl}/${encodeURIComponent(c.model)}:${method}?key=${encodeURIComponent(c.apiKey)}${query}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        // Gemini's assistant role is "model".
        contents: buildMessages(payload).map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature: 0.2 },
      }),
    },
  }
}

// One definition per wire — the single source of truth. The buffered (WIRES)
// and streaming (STREAM_WIRES) views are derived from it, so adding a wire is
// one entry here rather than parallel edits to two maps.
interface WireDef {
  request: (baseUrl: string, payload: PromptPayload, c: ProviderConfig, stream: boolean) => {
    url: string
    init: RequestInit
  }
  /** Text from a full buffered response. */
  extractText: (data: unknown) => string | undefined
  /** Token delta from one SSE event. */
  parseEvent: (data: unknown) => string | undefined
  /** Usage from a full buffered response. */
  bufferedUsage: (data: unknown) => TokenUsage | undefined
  /** Usage (possibly partial) from one SSE event. */
  streamUsage: (data: unknown) => Partial<TokenUsage> | undefined
  mapError?: (status: number, body: string) => ProviderError
}

const WIRE_DEFS: Record<Wire, WireDef> = {
  openai: {
    request: openaiRequest,
    extractText: (data) => (data as OpenAIResponse).choices?.[0]?.message?.content,
    parseEvent: (data) => (data as OpenAIResponse).choices?.[0]?.delta?.content,
    bufferedUsage: openaiUsage,
    streamUsage: openaiUsage,
  },
  anthropic: {
    request: anthropicRequest,
    extractText: (data) => (data as AnthropicResponse).content?.[0]?.text,
    parseEvent: (data) => {
      const e = data as AnthropicStreamEvent
      return e.type === 'content_block_delta' ? e.delta?.text : undefined
    },
    bufferedUsage: anthropicUsage,
    streamUsage: anthropicStreamUsage,
  },
  gemini: {
    request: geminiRequest,
    extractText: (data) => (data as GeminiResponse).candidates?.[0]?.content?.parts?.[0]?.text,
    parseEvent: (data) => (data as GeminiResponse).candidates?.[0]?.content?.parts?.[0]?.text,
    bufferedUsage: geminiUsage,
    streamUsage: geminiStreamUsage,
    mapError: geminiError,
  },
}

function deriveWires<T>(make: (def: WireDef) => T): Record<Wire, T> {
  return Object.fromEntries(
    (Object.entries(WIRE_DEFS) as [Wire, WireDef][]).map(([wire, def]) => [wire, make(def)]),
  ) as Record<Wire, T>
}

export const WIRES: Record<Wire, WireBuilder> = deriveWires(
  (def) => (baseUrl, payload) => ({
    buildRequest: (c) => def.request(baseUrl, payload, c, false),
    extractText: def.extractText,
    extractUsage: def.bufferedUsage,
    mapError: def.mapError,
  }),
)

export const STREAM_WIRES: Record<Wire, StreamWireBuilder> = deriveWires(
  (def) => (baseUrl, payload) => ({
    buildRequest: (c) => def.request(baseUrl, payload, c, true),
    parseEvent: def.parseEvent,
    parseUsage: def.streamUsage,
    // Used only when the endpoint ignores stream:true and returns a normal body.
    extractText: def.extractText,
    extractUsage: def.bufferedUsage,
    mapError: def.mapError,
  }),
)
