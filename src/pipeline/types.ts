// Types for the pure context-assembly pipeline. No browser or network deps.

/** How long an explanation should be. */
export type Verbosity = 'concise' | 'detailed'

export interface PipelineSettings {
  /** Language the explanation should be written in (passed through to the prompt). */
  targetLang: string
  /** Explanation length (defaults to 'concise' when unset). */
  verbosity?: Verbosity
  /** Max number of headings kept in the outline. */
  maxOutlineEntries?: number
  /** Max characters of the heuristic topic summary. */
  maxTopicChars?: number
  /** Max characters of the local section/paragraph sent to the model. */
  maxLocalContextChars?: number
}

/** A single extracted block of the document, in reading order. */
export interface Block {
  kind: 'heading' | 'prose' | 'code'
  /** Heading depth 1..6 for headings; undefined otherwise. */
  level?: number
  text: string
}

/** The parsed, structured document — produced once, cached by the worker. */
export interface ExtractedDoc {
  title: string
  blocks: Block[]
}

/** Deterministic, LLM-free summary of the whole document. */
export interface DocumentSummary {
  title: string
  outline: string[]
  topic: string
}

/** The section/paragraph the selection lives in. */
export interface LocalContext {
  heading: string | null
  text: string
}

/** One completed follow-up exchange inside a popup session. */
export interface FollowUpTurn {
  question: string
  answer: string
}

/** A follow-up continuation: the original explanation plus any prior follow-up
 * turns, and the new question to answer. Carried by the request so the worker
 * stays stateless (an MV3 worker can be killed between turns). */
export interface FollowUpThread {
  /** The original explanation the follow-up refers back to. */
  explanation: string
  /** Completed follow-up turns before this question, oldest first. */
  turns: FollowUpTurn[]
  /** The new question to answer. */
  question: string
}

/** The bounded payload handed to a provider adapter. */
export interface PromptPayload {
  summary: DocumentSummary
  localContext: LocalContext
  term: string
  targetLang: string
  verbosity: Verbosity
  /** Present on follow-up requests; absent on a first explanation. */
  followUp?: FollowUpThread
}

export interface AssembleInput {
  html: string
  selection: string
  settings: PipelineSettings
  /** Text of the selection's enclosing block, to disambiguate repeated terms. */
  contextHint?: string
  /** Follow-up thread to continue; absent on a first explanation. */
  followUp?: FollowUpThread
}

export const DEFAULTS = {
  maxOutlineEntries: 25,
  maxTopicChars: 600,
  maxLocalContextChars: 800,
} as const
