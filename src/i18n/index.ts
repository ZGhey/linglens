// UI strings in English and Simplified Chinese. The UI follows the browser's
// language (chrome.i18n.getUILanguage): Chinese browsers get Chinese, everything
// else English. Both tables share one key set, so a missing translation is a
// type error. Placeholders are {name}; **text** renders bold via localizeDom.
//
// This is UI copy only. The language explanations are *written in* is a
// separate setting (targetLang), which merely defaults to the UI language.

const en = {
  // Shared
  appTagline: 'Explain any term, in context',
  explainWithLinglens: 'Explain with Linglens',
  openSettings: 'Open settings',

  // Settings page — header & setup
  pageTitle: 'Linglens — Settings',
  notSetUp: 'Not set up',
  setupCtaTitle: 'Connect a model to start',
  setupCtaLede: 'A free Gemini key or your OpenRouter account — about 30 seconds.',
  setupCtaButton: 'Set up Linglens',
  onboardingTitle: 'Connect a model',
  onboardingLede: 'Linglens writes explanations with an AI model you choose. Your key stays in this browser.',
  geminiCardTitle: 'Free Gemini key',
  recommended: 'Recommended',
  geminiCardLede: 'Use your Google account. No credit card.',
  openAiStudio: 'Open Google AI Studio',
  geminiStep2: 'Click **Create API key**, then copy it.',
  geminiStep3: "Paste it here — it's checked automatically.",
  geminiKeyLabel: 'Gemini API key',
  geminiPrivacy:
    "When you explain something, the selected text and a short summary of the page go to Google. Google's free tier may use them to improve its products.",
  openRouterTitle: 'OpenRouter',
  openRouterLede: 'Sign in and approve — no key to copy. Free models included (daily limit).',
  connect: 'Connect',
  haveKeyTitle: 'I have an API key',
  haveKeyLede: 'OpenAI, Anthropic, DeepSeek, Gemini, or any OpenAI-compatible endpoint.',
  enterKey: 'Enter key',
  assistGemini: 'No key yet? Create one free with your Google account, then paste it below.',
  assistOpenRouter: 'No key to copy: sign in to OpenRouter and approve.',
  connectOpenRouter: 'Connect OpenRouter',
  keyWorksSave: 'Key works ({model}). Click Save to use it.',
  openRouterKeyWorks: 'Key works. Click Save to use it.',
  openRouterKeyWorksFree: 'Key works — free models, {count} requests left today. Click Save to use it.',
  openRouterKeyRejected: 'OpenRouter rejected this key.',
  assistKeyPage: 'Create a key in your {provider} dashboard, then paste it below — it is checked automatically.',
  getApiKey: 'Get API key',
  keyRejected: '{provider} rejected this key. Copy it again from the dashboard.',

  // Settings page — form
  tabSettings: 'Settings',
  tabHistory: 'History',
  groupModel: 'Model',
  provider: 'Provider',
  baseUrl: 'Base URL',
  baseUrlHint: 'OpenAI-compatible endpoint. /chat/completions is appended.',
  model: 'Model',
  customOption: 'Custom…',
  modelCustomHint:
    "Paste an exact model id from your provider's docs. If a preset returns a 404, pick Custom and enter the current id.",
  apiKey: 'API key',
  keyHint: 'Enter your {provider} API key.',
  freeTierNote:
    "A provider's free tier may use your prompts to improve its products (Gemini's free tier does; its paid tier doesn't). Use a paid key or a local model if that matters.",
  groupExplanations: 'Explanations',
  language: 'Language',
  customLanguage: 'Custom language',
  length: 'Length',
  lengthConcise: 'Concise — 1–2 sentences',
  lengthDetailed: 'Detailed — 4–6 sentences with an example',
  groupPdfs: 'PDFs',
  pdfReaderToggle: 'Open PDFs in the Linglens reader',
  pdfReaderHint:
    'Select text in any PDF to explain it, like on web pages. Turn off to keep Chrome\'s viewer. Local files also need "Allow access to file URLs" in chrome://extensions.',
  saveChanges: 'Save changes',
  saved: 'Saved',
  keepLast: 'Keep last',
  historyHint: 'entries (1–1000). Saved with Settings. Re-reading an entry makes no API call.',
  clearHistory: 'Clear history',
  historyEmpty: 'Nothing explained yet.',
  openPage: 'Open page',
  openSource: 'Open source',
  privacy: 'Privacy',

  // Onboarding status
  checkingKey: 'Checking your key…',
  geminiConnected: 'Connected ({model}). Select a word on any web page or PDF and click the Linglens icon.',
  geminiRateLimitedNote:
    'Key saved. Google is rate-limiting it right now — if an explanation fails, wait a minute and try again.',
  geminiNetwork: "Couldn't reach Google. Check your internet connection and paste the key again.",
  geminiRegion:
    "Google doesn't offer the Gemini API in your region. Use OpenRouter or another provider with your own key instead.",
  geminiRejectedWithReason: 'Google rejected this key: {reason}',
  geminiInvalid: "That doesn't look like a working Gemini key. Copy it again from AI Studio (it starts with “AIza”).",
  geminiErrorWithReason: 'Google returned an error: {reason}',
  geminiErrorStatus: 'Google returned an unexpected error (HTTP {status}). Try again in a moment.',
  openRouterWaiting: 'Waiting for you to approve on OpenRouter…',
  openRouterOpenFailed: "Couldn't open OpenRouter. Try again.",
  openRouterConnected: 'Connected. Select a word on any web page or PDF and click the Linglens icon.',
  openRouterConnectedFree:
    'Connected — free models, {count} requests left today. Select a word on any web page or PDF and click the Linglens icon.',
  openRouterFailed: 'Connecting OpenRouter failed. Try again.',
  openRouterClosed: 'OpenRouter sign-in was closed before approving.',
  openRouterUnreachable: "Couldn't reach OpenRouter. Check your connection and try again.",
  openRouterExpired: 'OpenRouter rejected the sign-in (it may have expired). Try connecting again.',
  openRouterHttpError: 'OpenRouter returned an error (HTTP {status}). Try again.',
  openRouterNoKey: 'OpenRouter did not return a key. Try connecting again.',

  // Explanation popup
  explaining: 'Explaining…',
  copy: 'Copy',
  copied: 'Copied',
  concise: 'Concise',
  detailed: 'Detailed',
  tokenUsage: '↑ {input} in · ↓ {output} out',
  askFollowUp: 'Ask a follow-up…',
  ask: 'Ask',
  errMissingKey: 'No API key set. Open settings and add your provider key to get started.',
  errInvalidKey: 'Your API key was rejected. Open settings and check the key for the selected provider.',
  errRateLimited: 'The provider is rate-limiting you. Wait a few seconds and try again.',
  errNoSelection: 'Select a word or phrase first, then trigger Linglens.',
  errNetwork: 'Could not reach the provider. Check your internet connection and retry.',
  errUnknown: 'Something went wrong. Please try again.',
  errInterrupted: 'The explanation was interrupted.',
  errFollowUpInterrupted: 'The follow-up was interrupted.',
  errEmptyResponse: 'The provider returned an empty response.',
  errLostStream: 'Lost connection to the provider mid-stream.',
  errNoBaseUrl: 'No base URL set. Add one in Linglens settings.',
  errHttp: 'The provider returned an unexpected error (HTTP {status}).',
  errUnknownProvider: 'Unknown provider "{id}".',

  // PDFs
  pdfViewerNotice:
    "Linglens can't read text in Chrome's PDF viewer. Turn on the Linglens PDF reader in settings to explain PDF text.",
  readerTitle: 'Linglens PDF reader',
  readerNoFile: 'No PDF to show. Open a PDF link and Linglens will display it here.',
  readerLoading: 'Loading PDF…',
  readerFallingBack: 'Opening in Chrome’s viewer…',
  readerPassword: 'This PDF is protected. Password:',
  readerWrongPassword: 'Wrong password. Try again:',
  pageNumber: 'Page number',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomLevel: 'Zoom level',
  zoomAuto: 'Automatic',
  zoomPageWidth: 'Page width',
  zoomPageFit: 'Whole page',
  findPlaceholder: 'Find in PDF',
  findPrevious: 'Previous match',
  findNext: 'Next match',
  noMatches: 'No matches',
  download: 'Download',
  downloadTitle: 'Download PDF',
  chromeViewer: 'Chrome viewer',
  chromeViewerTitle: "Open this PDF in Chrome's own viewer (e.g. to print)",
} as const

export type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  appTagline: '划词即解释，结合上下文',
  explainWithLinglens: '用 Linglens 解释',
  openSettings: '打开设置',

  pageTitle: 'Linglens — 设置',
  notSetUp: '未设置',
  setupCtaTitle: '连接一个模型即可开始',
  setupCtaLede: '用免费的 Gemini key 或你的 OpenRouter 账号，大约 30 秒。',
  setupCtaButton: '开始设置',
  onboardingTitle: '连接模型',
  onboardingLede: 'Linglens 用你选择的 AI 模型来写解释。你的 key 只保存在这个浏览器里。',
  geminiCardTitle: '免费 Gemini key',
  recommended: '推荐',
  geminiCardLede: '用 Google 账号登录即可，无需绑卡。',
  openAiStudio: '打开 Google AI Studio',
  geminiStep2: '点击 **Create API key**，然后复制。',
  geminiStep3: '粘贴到这里，会自动校验。',
  geminiKeyLabel: 'Gemini API key',
  geminiPrivacy:
    '解释时，选中的文字和页面的简短摘要会发送给 Google。Google 的免费额度可能会用这些内容改进其产品。',
  openRouterTitle: 'OpenRouter',
  openRouterLede: '登录并授权即可，无需复制 key。含免费模型（每日有次数限制）。',
  connect: '连接',
  haveKeyTitle: '我已有 API key',
  haveKeyLede: 'OpenAI、Anthropic、DeepSeek、Gemini，或任何兼容 OpenAI 的接口。',
  enterKey: '手动填写',
  assistGemini: '还没有 key？用 Google 账号免费创建一个，然后粘贴到下面。',
  assistOpenRouter: '不用复制 key：登录 OpenRouter 并授权即可。',
  connectOpenRouter: '一键连接 OpenRouter',
  keyWorksSave: 'key 可用（{model}），点“保存”后生效。',
  openRouterKeyWorks: 'key 可用，点“保存”后生效。',
  openRouterKeyWorksFree: 'key 可用 — 免费模型，今天还剩 {count} 次。点“保存”后生效。',
  openRouterKeyRejected: 'OpenRouter 拒绝了这个 key。',
  assistKeyPage: '在 {provider} 后台创建一个 key，然后粘贴到下面，会自动校验。',
  getApiKey: '获取 API key',
  keyRejected: '{provider} 拒绝了这个 key，请从后台重新复制。',

  tabSettings: '设置',
  tabHistory: '历史',
  groupModel: '模型',
  provider: '服务商',
  baseUrl: '接口地址',
  baseUrlHint: '兼容 OpenAI 的接口，会自动追加 /chat/completions。',
  model: '模型',
  customOption: '自定义…',
  modelCustomHint: '从服务商文档里粘贴准确的模型 id。如果预设模型返回 404，选择“自定义”并填写当前的 id。',
  apiKey: 'API key',
  keyHint: '填写你的 {provider} API key。',
  freeTierNote:
    '服务商的免费额度可能会用你的请求内容改进其产品（Gemini 免费版会，付费版不会）。介意的话请使用付费 key 或本地模型。',
  groupExplanations: '解释',
  language: '解释语言',
  customLanguage: '自定义语言',
  length: '长度',
  lengthConcise: '简洁 — 1–2 句',
  lengthDetailed: '详细 — 4–6 句，附示例',
  groupPdfs: 'PDF',
  pdfReaderToggle: '用 Linglens 阅读器打开 PDF',
  pdfReaderHint:
    '在任何 PDF 里划词解释，和网页一样。关闭则保留 Chrome 自带的 PDF 查看器。本地文件还需要在 chrome://extensions 里打开“允许访问文件网址”。',
  saveChanges: '保存',
  saved: '已保存',
  keepLast: '保留最近',
  historyHint: '条（1–1000），随设置一起保存。查看历史不会调用 API。',
  clearHistory: '清空历史',
  historyEmpty: '还没有解释过任何内容。',
  openPage: '打开原网页',
  openSource: '开源项目',
  privacy: '隐私说明',

  checkingKey: '正在校验 key…',
  geminiConnected: '已连接（{model}）。在任意网页或 PDF 上选中一个词，点 Linglens 图标即可。',
  geminiRateLimitedNote: 'key 已保存。Google 目前对它限流，如果解释失败，稍等一分钟再试。',
  geminiNetwork: '无法连接 Google。请检查网络后重新粘贴 key。',
  geminiRegion: 'Google 不在你所在的地区提供 Gemini API。请改用 OpenRouter 或其他服务商的 key。',
  geminiRejectedWithReason: 'Google 拒绝了这个 key：{reason}',
  geminiInvalid: '这不像是可用的 Gemini key。请从 AI Studio 重新复制（以“AIza”开头）。',
  geminiErrorWithReason: 'Google 返回了错误：{reason}',
  geminiErrorStatus: 'Google 返回了意外错误（HTTP {status}）。请稍后再试。',
  openRouterWaiting: '等待你在 OpenRouter 上授权…',
  openRouterOpenFailed: '无法打开 OpenRouter，请重试。',
  openRouterConnected: '已连接。在任意网页或 PDF 上选中一个词，点 Linglens 图标即可。',
  openRouterConnectedFree:
    '已连接 — 免费模型，今天还剩 {count} 次。在任意网页或 PDF 上选中一个词，点 Linglens 图标即可。',
  openRouterFailed: '连接 OpenRouter 失败，请重试。',
  openRouterClosed: '授权完成前 OpenRouter 登录页被关闭了。',
  openRouterUnreachable: '无法连接 OpenRouter。请检查网络后重试。',
  openRouterExpired: 'OpenRouter 拒绝了这次登录（可能已过期），请重新连接。',
  openRouterHttpError: 'OpenRouter 返回了错误（HTTP {status}），请重试。',
  openRouterNoKey: 'OpenRouter 没有返回 key，请重新连接。',

  explaining: '正在解释…',
  copy: '复制',
  copied: '已复制',
  concise: '简洁',
  detailed: '详细',
  tokenUsage: '↑ 输入 {input} · ↓ 输出 {output}',
  askFollowUp: '继续追问…',
  ask: '提问',
  errMissingKey: '还没有设置 API key。打开设置，填写服务商的 key 即可开始。',
  errInvalidKey: 'API key 被拒绝。请打开设置，检查当前服务商的 key。',
  errRateLimited: '服务商正在限流，请等几秒再试。',
  errNoSelection: '请先选中一个词或短语，再触发 Linglens。',
  errNetwork: '无法连接服务商。请检查网络后重试。',
  errUnknown: '出了点问题，请重试。',
  errInterrupted: '解释被中断了。',
  errFollowUpInterrupted: '追问被中断了。',
  errEmptyResponse: '服务商返回了空内容。',
  errLostStream: '与服务商的连接在传输中断开了。',
  errNoBaseUrl: '还没有设置接口地址，请在 Linglens 设置里填写。',
  errHttp: '服务商返回了意外错误（HTTP {status}）。',
  errUnknownProvider: '未知的服务商“{id}”。',

  pdfViewerNotice: 'Linglens 读取不了 Chrome 自带 PDF 查看器里的文字。在设置里打开 Linglens PDF 阅读器，即可在 PDF 里划词解释。',
  readerTitle: 'Linglens PDF 阅读器',
  readerNoFile: '没有要显示的 PDF。打开一个 PDF 链接，Linglens 会在这里显示它。',
  readerLoading: '正在加载 PDF…',
  readerFallingBack: '正在用 Chrome 查看器打开…',
  readerPassword: '这个 PDF 有密码保护，请输入密码：',
  readerWrongPassword: '密码错误，请重试：',
  pageNumber: '页码',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomLevel: '缩放',
  zoomAuto: '自动',
  zoomPageWidth: '适合页宽',
  zoomPageFit: '整页',
  findPlaceholder: '在 PDF 中查找',
  findPrevious: '上一个',
  findNext: '下一个',
  noMatches: '无匹配',
  download: '下载',
  downloadTitle: '下载 PDF',
  chromeViewer: 'Chrome 查看器',
  chromeViewerTitle: '用 Chrome 自带的查看器打开这个 PDF（例如为了打印）',
}

export type Locale = 'en' | 'zh'

/** The browser's UI language, reduced to the locales Linglens ships. */
export function uiLocale(): Locale {
  let lang = ''
  try {
    lang = globalThis.chrome?.i18n?.getUILanguage?.() ?? ''
  } catch {
    // not in an extension context (tests)
  }
  if (!lang && typeof navigator !== 'undefined') lang = navigator.language ?? ''
  return /^zh\b/i.test(lang) ? 'zh' : 'en'
}

let override: Locale | null = null

/** Pin the locale (tests). Pass null to follow the browser again. */
export function setLocale(locale: Locale | null): void {
  override = locale
}

function table(): Record<MessageKey, string> {
  return (override ?? uiLocale()) === 'zh' ? zh : en
}

/** Translate a UI string, filling {placeholders}. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return table()[key].replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  )
}

/** Exposed for the key-parity test. */
export const MESSAGES = { en, zh } as const

/**
 * Fill static page text from data attributes:
 *   data-i18n="key"             → text content (**bold** supported)
 *   data-i18n-placeholder="key" → placeholder
 *   data-i18n-title="key"       → title
 *   data-i18n-aria="key"        → aria-label
 * Built with DOM APIs (no innerHTML).
 */
export function localizeDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const text = t(el.dataset.i18n as MessageKey)
    el.replaceChildren()
    text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        const b = document.createElement('b')
        b.textContent = part.slice(2, -2)
        el.appendChild(b)
      } else if (part) {
        el.appendChild(document.createTextNode(part))
      }
    })
  })
  const attr = (data: string, name: string) =>
    root.querySelectorAll<HTMLElement>(`[${data}]`).forEach((el) => {
      el.setAttribute(name, t(el.getAttribute(data) as MessageKey))
    })
  attr('data-i18n-placeholder', 'placeholder')
  attr('data-i18n-title', 'title')
  attr('data-i18n-aria', 'aria-label')
  if (document.documentElement) document.documentElement.lang = uiLocale() === 'zh' ? 'zh-CN' : 'en'
}
