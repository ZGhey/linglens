// Options / settings page. Loads settings, lets the user edit them, and persists
// back to chrome.storage.local. Per-provider keys/models are kept so switching
// provider preserves each one. Every provider's model is either a preset or a
// free-text id (vendors rename ids often); the `custom` provider additionally
// exposes a user-editable base URL.

import { activeConfig, loadSettings, saveSettings, LANGUAGE_PRESETS, type Settings } from '@/settings'
import { AI_STUDIO_KEY_URL, checkGeminiKey } from '@/onboarding/gemini'
import { fetchKeyInfo } from '@/onboarding/openrouter'
import { KEY_PAGES, canCheckKey, checkKeyByModels, chooseModel } from '@/onboarding/keycheck'
import type { OpenRouterConnectRequest, OpenRouterResultMessage } from '@/messaging/types'
import { PROVIDERS, PROVIDER_MAP } from '@/providers'
import type { ProviderId } from '@/providers/types'
import { clampHistoryLimit, trimHistory } from '@/history'
import { mountHistory } from './history-view'
import { localizeDom, t } from '@/i18n'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const providerEl = $<HTMLSelectElement>('provider')
const baseUrlEl = $<HTMLInputElement>('baseUrl')
const baseUrlLabelEl = $<HTMLLabelElement>('baseUrlLabel')
const baseUrlHintEl = $<HTMLParagraphElement>('baseUrlHint')
const baseUrlFieldEl = $<HTMLDivElement>('baseUrlField')
const connectionEl = $<HTMLSpanElement>('connection')
const modelEl = $<HTMLSelectElement>('model')
const modelCustomEl = $<HTMLInputElement>('modelCustom')
const modelCustomHintEl = $<HTMLParagraphElement>('modelCustomHint')
const apiKeyEl = $<HTMLInputElement>('apiKey')
const keyHintEl = $<HTMLParagraphElement>('keyHint')
const langEl = $<HTMLSelectElement>('lang')
const langCustomEl = $<HTMLInputElement>('langCustom')
const verbosityEl = $<HTMLSelectElement>('verbosity')
const pdfReaderEl = $<HTMLInputElement>('pdfReader')
const saveEl = $<HTMLButtonElement>('save')
const statusEl = $<HTMLSpanElement>('status')
const historyEl = $<HTMLDivElement>('history')
const clearHistoryEl = $<HTMLButtonElement>('clearHistory')
const settingsPanelEl = $<HTMLDivElement>('tab-settings')
const historyPanelEl = $<HTMLDivElement>('tab-history')
const settingsTabEl = $<HTMLButtonElement>('tab-btn-settings')
const historyTabEl = $<HTMLButtonElement>('tab-btn-history')
const historyLimitEl = $<HTMLInputElement>('historyLimit')
const tabsEl = document.querySelector<HTMLDivElement>('.tabs')!
const setupCtaEl = $<HTMLDivElement>('setupCta')
const openSetupEl = $<HTMLButtonElement>('openSetup')
const onboardingEl = $<HTMLElement>('onboarding')
const openAiStudioEl = $<HTMLButtonElement>('openAiStudio')
const geminiKeyEl = $<HTMLInputElement>('geminiKey')
const geminiStatusEl = $<HTMLParagraphElement>('geminiStatus')
const showManualEl = $<HTMLButtonElement>('showManual')
const manualCardEl = showManualEl.closest<HTMLElement>('.option')!
const connectOpenRouterEl = $<HTMLButtonElement>('connectOpenRouter')
const openrouterStatusEl = $<HTMLParagraphElement>('openrouterStatus')
const providerAssistEl = $<HTMLDivElement>('providerAssist')
const assistTextEl = $<HTMLParagraphElement>('assistText')
const assistActionEl = $<HTMLButtonElement>('assistAction')
const assistStatusEl = $<HTMLParagraphElement>('assistStatus')

let refreshHistory: () => void = () => {}

// Sentinel value for the "type your own language" option in the language select.
const CUSTOM_LANG = '__custom__'
// Sentinel for the "type your own model id" option in the model select. Vendors
// rename/retire model ids often, so every provider allows a free-text id.
const CUSTOM_MODEL = '__custom__'

let settings: Settings

function currentProvider(): ProviderId {
  return providerEl.value as ProviderId
}

/** Populate the model dropdown (presets + a "Custom…" escape) and reflect the
 * stored model: a preset selects itself, anything else (a pasted or delisted id)
 * opens the free-text box under "Custom…" so nothing is silently lost. */
function renderModelOptions(provider: ProviderId): void {
  modelEl.innerHTML = ''
  for (const m of PROVIDER_MAP[provider].models) {
    const opt = document.createElement('option')
    opt.value = m
    opt.textContent = m
    modelEl.appendChild(opt)
  }
  const customOpt = document.createElement('option')
  customOpt.value = CUSTOM_MODEL
  customOpt.textContent = t('customOption')
  modelEl.appendChild(customOpt)

  const stored = settings.models[provider]
  if (PROVIDER_MAP[provider].models.includes(stored)) {
    modelEl.value = stored
    modelCustomEl.value = ''
  } else {
    modelEl.value = CUSTOM_MODEL
    modelCustomEl.value = stored
  }
  syncModelCustomVisibility()
}

/** Show the free-text model box + its hint only when "Custom…" is selected. */
function syncModelCustomVisibility(): void {
  const showCustom = modelEl.value === CUSTOM_MODEL
  modelCustomEl.hidden = !showCustom
  modelCustomHintEl.hidden = !showCustom
}

/** Show the fields for the selected provider from the in-memory settings. Only
 * the `custom` (OpenAI-compatible) provider reveals the base-URL row and hides
 * the preset dropdown (it has none); every provider shares the model dropdown +
 * free-text escape. */
function showProvider(provider: ProviderId): void {
  const descriptor = PROVIDER_MAP[provider]
  apiKeyEl.value = settings.apiKeys[provider]
  keyHintEl.textContent = t('keyHint', { provider: descriptor.label })
  renderAssist(provider)

  const custom = descriptor.custom ?? false
  baseUrlLabelEl.hidden = !custom
  baseUrlEl.hidden = !custom
  baseUrlHintEl.hidden = !custom
  baseUrlFieldEl.hidden = !custom
  if (custom) baseUrlEl.value = settings.customBaseUrl

  // A provider with no presets (custom) has nothing to pick, so hide the
  // dropdown and let its free-text box stand alone.
  modelEl.hidden = descriptor.models.length === 0
  renderModelOptions(provider)
}

/** The model to persist: the free-text box when "Custom…" is chosen, else the
 * selected preset. */
function currentModel(): string {
  return modelEl.value === CUSTOM_MODEL ? modelCustomEl.value.trim() : modelEl.value
}

/** Pull the visible fields for the active provider back into settings. */
function captureProvider(provider: ProviderId): void {
  settings.apiKeys[provider] = apiKeyEl.value.trim()
  settings.models[provider] = currentModel()
  if (PROVIDER_MAP[provider].custom) {
    settings.customBaseUrl = baseUrlEl.value.trim()
  }
}

/** Build the language dropdown (presets + a "Custom…" escape) and reflect the
 * stored language: a preset selects itself, anything else opens the custom box. */
function renderLanguageOptions(): void {
  langEl.innerHTML = ''
  for (const lang of LANGUAGE_PRESETS) {
    const opt = document.createElement('option')
    opt.value = lang
    opt.textContent = lang
    langEl.appendChild(opt)
  }
  const customOpt = document.createElement('option')
  customOpt.value = CUSTOM_LANG
  customOpt.textContent = t('customOption')
  langEl.appendChild(customOpt)

  if (LANGUAGE_PRESETS.includes(settings.targetLang)) {
    langEl.value = settings.targetLang
    langCustomEl.value = ''
  } else {
    langEl.value = CUSTOM_LANG
    langCustomEl.value = settings.targetLang
  }
  syncLangCustomVisibility()
}

/** Show the free-text box only when "Custom…" is the selected language. */
function syncLangCustomVisibility(): void {
  langCustomEl.hidden = langEl.value !== CUSTOM_LANG
}

/** The language to persist: the custom box when "Custom…" is chosen, else the
 * selected preset. Empty custom input falls back to English. */
function currentLanguage(): string {
  if (langEl.value === CUSTOM_LANG) {
    return langCustomEl.value.trim() || 'English'
  }
  return langEl.value
}

async function init(): Promise<void> {
  localizeDom()
  document.title = t('pageTitle')
  settings = await loadSettings()

  for (const descriptor of PROVIDERS) {
    const opt = document.createElement('option')
    opt.value = descriptor.id
    opt.textContent = descriptor.label
    providerEl.appendChild(opt)
  }
  providerEl.value = settings.provider
  showProvider(settings.provider)
  renderLanguageOptions()
  verbosityEl.value = settings.verbosity
  pdfReaderEl.checked = settings.pdfReader

  providerEl.addEventListener('change', () => {
    // Capture edits to the provider we're leaving (settings.provider still holds
    // the previous value), then switch and show the newly selected one.
    captureProvider(settings.provider)
    settings.provider = currentProvider()
    showProvider(settings.provider)
  })

  langEl.addEventListener('change', syncLangCustomVisibility)
  modelEl.addEventListener('change', syncModelCustomVisibility)

  saveEl.addEventListener('click', () => void save())

  settingsTabEl.addEventListener('click', () => showTab('settings'))
  historyTabEl.addEventListener('click', () => showTab('history'))
  // Land on History once configured (the common return visit); on Settings while
  // there's no key anywhere yet, so first-run users see setup.
  const configured = Object.values(settings.apiKeys).some((k) => k.trim())
  showTab(configured ? 'history' : 'settings')

  historyLimitEl.value = String(settings.historyLimit)
  refreshHistory = mountHistory(historyEl, clearHistoryEl)

  wireOnboarding()
  renderSetupState()
}

/** True when this page is showing as the toolbar popup (not a tab). */
function inPopup(): boolean {
  try {
    return chrome.extension.getViews({ type: 'popup' }).includes(window)
  } catch {
    return false
  }
}

function isConfigured(s: Settings): boolean {
  return activeConfig(s).apiKey.trim() !== ''
}

/** Show the main settings UI (tabs + panels) or hide it behind onboarding. */
function setMainVisible(visible: boolean): void {
  tabsEl.hidden = !visible
  if (!visible) {
    settingsPanelEl.hidden = true
    historyPanelEl.hidden = true
  } else if (settingsPanelEl.hidden && historyPanelEl.hidden) {
    showTab('settings')
  }
}

/** First run: in a tab, lead with the guided free key; in the toolbar popup,
 *  offer to open that tab (the popup closes when focus moves to Google). */
/** Header badge: which provider + model is active, or that none is set up. */
function renderConnection(): void {
  const cfg = activeConfig(settings)
  if (cfg.apiKey.trim()) {
    // Provider in the badge; the model is in its tooltip (the popup is narrow).
    const label = PROVIDER_MAP[cfg.provider].label
    connectionEl.textContent = label
    connectionEl.title = cfg.model ? `${label} · ${cfg.model}` : label
    connectionEl.dataset.state = 'on'
  } else {
    connectionEl.textContent = t('notSetUp')
    connectionEl.title = ''
    connectionEl.dataset.state = 'off'
  }
}

function renderSetupState(): void {
  renderConnection()
  if (isConfigured(settings)) {
    setupCtaEl.hidden = true
    onboardingEl.hidden = true
    setMainVisible(true)
    return
  }
  if (inPopup()) {
    setupCtaEl.hidden = false
    onboardingEl.hidden = true
    setMainVisible(true)
    return
  }
  setupCtaEl.hidden = true
  onboardingEl.hidden = false
  setMainVisible(false)
}

function setStatusLine(el: HTMLElement, text: string, tone: 'ok' | 'err' | ''): void {
  el.textContent = text
  el.className = `hint ${tone}`.trim()
}

function setGeminiStatus(text: string, tone: 'ok' | 'err' | '' = ''): void {
  setStatusLine(geminiStatusEl, text, tone)
}

function setOpenRouterStatus(text: string, tone: 'ok' | 'err' | '' = ''): void {
  // The flow can start from onboarding or from the settings form.
  setStatusLine(openrouterStatusEl, text, tone)
  if (currentProvider() === 'openrouter') setStatusLine(assistStatusEl, text, tone)
}

/** Settings form: the guided way to get a key for providers that have one. */
function renderAssist(provider: ProviderId): void {
  setStatusLine(assistStatusEl, '', '')
  if (provider === 'gemini') {
    assistTextEl.textContent = t('assistGemini')
    assistActionEl.textContent = t('openAiStudio')
    providerAssistEl.hidden = false
  } else if (provider === 'openrouter') {
    assistTextEl.textContent = t('assistOpenRouter')
    assistActionEl.textContent = t('connectOpenRouter')
    providerAssistEl.hidden = false
  } else if (KEY_PAGES[provider]) {
    assistTextEl.textContent = t('assistKeyPage', { provider: PROVIDER_MAP[provider].label })
    assistActionEl.textContent = t('getApiKey')
    providerAssistEl.hidden = false
  } else {
    providerAssistEl.hidden = true
  }
}

function startOpenRouterConnect(): void {
  setOpenRouterStatus(t('openRouterWaiting'))
  const msg: OpenRouterConnectRequest = { type: 'OPENROUTER_CONNECT' }
  void chrome.runtime.sendMessage(msg).then((started) => {
    if (!started) setOpenRouterStatus(t('openRouterOpenFailed'), 'err')
  })
}

/** Settings form: check a pasted key for providers we can check without
 *  generating text, and for Gemini pick a model the key can use. */
function wireKeyCheck(): void {
  let latest = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  apiKeyEl.addEventListener('input', () => {
    clearTimeout(timer)
    const provider = currentProvider()
    const key = apiKeyEl.value.trim()
    const checkable = provider === 'gemini' || provider === 'openrouter' || canCheckKey(provider)
    if (!checkable || key.length < 10) {
      setStatusLine(assistStatusEl, '', '')
      return
    }
    const id = ++latest
    timer = setTimeout(async () => {
      setStatusLine(assistStatusEl, t('checkingKey'), '')
      if (provider === 'gemini') {
        const result = await checkGeminiKey(key)
        if (id !== latest || currentProvider() !== provider) return
        if (!result.ok) {
          setStatusLine(assistStatusEl, result.message, 'err')
          return
        }
        settings.apiKeys.gemini = key
        settings.models.gemini = result.model
        renderModelOptions('gemini')
        setStatusLine(assistStatusEl, result.note ?? t('keyWorksSave', { model: result.model }), 'ok')
      } else if (provider !== 'openrouter') {
        const result = await checkKeyByModels(provider, key)
        if (id !== latest || currentProvider() !== provider) return
        if (!result.ok) {
          setStatusLine(
            assistStatusEl,
            result.reason === 'invalid'
              ? t('keyRejected', { provider: PROVIDER_MAP[provider].label })
              : result.reason === 'unverified'
                ? t('keyUnverified')
                : result.reason === 'rate-limited'
                ? t('errRateLimited')
                : result.reason === 'network'
                  ? t('errNetwork')
                  : t('errHttp', { status: result.status ?? '?' }),
            'err',
          )
          return
        }
        const model = chooseModel(currentModel(), PROVIDER_MAP[provider].models, result.models)
        settings.apiKeys[provider] = key
        settings.models[provider] = model
        renderModelOptions(provider)
        setStatusLine(assistStatusEl, t('keyWorksSave', { model }), 'ok')
      } else {
        const info = await fetchKeyInfo(key)
        if (id !== latest || currentProvider() !== provider) return
        if (!info) {
          setStatusLine(assistStatusEl, t('openRouterKeyRejected'), 'err')
          return
        }
        setStatusLine(
          assistStatusEl,
          info.isFreeTier && info.freeRequestsRemaining !== null
            ? t('openRouterKeyWorksFree', { count: info.freeRequestsRemaining })
            : t('openRouterKeyWorks'),
          'ok',
        )
      }
    }, 300)
  })
}

function wireOnboarding(): void {
  openSetupEl.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage()
    window.close()
  })
  openAiStudioEl.addEventListener('click', () => {
    void chrome.tabs.create({ url: AI_STUDIO_KEY_URL })
  })
  showManualEl.addEventListener('click', () => {
    onboardingEl.hidden = true
    setMainVisible(true)
    showTab('settings')
    providerEl.focus()
  })

  // Check as soon as a key is pasted (or typed); only the latest check counts.
  let latest = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  geminiKeyEl.addEventListener('input', () => {
    clearTimeout(timer)
    const key = geminiKeyEl.value.trim()
    if (key.length < 10) {
      setGeminiStatus('')
      return
    }
    timer = setTimeout(() => void connectGemini(key, ++latest), 300)
  })

  connectOpenRouterEl.addEventListener('click', startOpenRouterConnect)
  assistActionEl.addEventListener('click', () => {
    if (currentProvider() === 'gemini') void chrome.tabs.create({ url: AI_STUDIO_KEY_URL })
    else if (currentProvider() === 'openrouter') startOpenRouterConnect()
    else {
      const page = KEY_PAGES[currentProvider()]
      if (page) void chrome.tabs.create({ url: page })
    }
  })
  wireKeyCheck()
  chrome.runtime.onMessage.addListener((message: unknown) => {
    const msg = message as Partial<OpenRouterResultMessage> | null
    if (msg?.type !== 'OPENROUTER_RESULT') return
    if (!msg.ok) {
      setOpenRouterStatus(msg.message ?? t('openRouterFailed'), 'err')
      return
    }
    void onOpenRouterConnected()
  })

  async function onOpenRouterConnected(): Promise<void> {
    // The worker saved the key and selected OpenRouter; reflect that here.
    settings = await loadSettings()
    providerEl.value = settings.provider
    showProvider(settings.provider)
    setOpenRouterStatus(t('openRouterConnected'), 'ok')
    manualCardEl.hidden = true
    setMainVisible(true)
    renderConnection()
    const info = await fetchKeyInfo(settings.apiKeys.openrouter)
    if (info?.isFreeTier && info.freeRequestsRemaining !== null) {
      setOpenRouterStatus(
        t('openRouterConnectedFree', { count: info.freeRequestsRemaining }),
        'ok',
      )
    }
  }

  async function connectGemini(key: string, id: number): Promise<void> {
    setGeminiStatus(t('checkingKey'))
    const result = await checkGeminiKey(key)
    if (id !== latest) return
    if (!result.ok) {
      setGeminiStatus(result.message, 'err')
      return
    }
    settings.apiKeys.gemini = key
    settings.models.gemini = result.model
    settings.provider = 'gemini'
    await saveSettings(settings)
    providerEl.value = 'gemini'
    showProvider('gemini')
    setGeminiStatus(
      result.note ??
        t('geminiConnected', { model: result.model }),
      'ok',
    )
    manualCardEl.hidden = true
    setMainVisible(true)
    renderConnection()
  }
}

/** Toggle the two settings tabs. */
function showTab(tab: 'settings' | 'history'): void {
  const onHistory = tab === 'history'
  settingsPanelEl.hidden = onHistory
  historyPanelEl.hidden = !onHistory
  settingsTabEl.setAttribute('aria-selected', String(!onHistory))
  historyTabEl.setAttribute('aria-selected', String(onHistory))
}

async function save(): Promise<void> {
  captureProvider(currentProvider())
  settings.provider = currentProvider()
  settings.targetLang = currentLanguage()
  settings.verbosity = verbosityEl.value as Settings['verbosity']
  settings.pdfReader = pdfReaderEl.checked
  settings.historyLimit = clampHistoryLimit(parseInt(historyLimitEl.value, 10))
  historyLimitEl.value = String(settings.historyLimit)
  await saveSettings(settings)
  // Apply a lowered cap immediately, then re-render the (possibly shorter) list.
  await trimHistory(settings.historyLimit)
  refreshHistory()
  renderConnection()
  statusEl.textContent = t('saved')
  setTimeout(() => (statusEl.textContent = ''), 1500)
}

void init()
