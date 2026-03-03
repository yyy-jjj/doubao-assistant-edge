const MSG_SCROLL_TO = 'SCROLL_TO'
const MSG_REFRESH_CAPTURE = 'REFRESH_CAPTURE'

const USER_TEXT_SELECTOR = 'div[data-testid="message_text_content"]'
const ANCHOR_ATTR = 'data-db-assist-anchor'
const TIME_ATTR = 'data-db-msg-time'
const STORAGE_KEY = 'questions'
const STORAGE_MAX = 2000

type QuestionItem = {
  qid: string
  text: string
  timestamp: number
  pageUrl: string
  anchorId: string
  conversationId?: string
  dedupeKey: string
  order?: number
}

let captureTimer: number | undefined

function extAlive() {
  try {
    return !!chrome?.runtime?.id && !!chrome?.storage?.local && !!chrome?.runtime?.onMessage
  } catch {
    return false
  }
}

function cleanText(text: string) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function getConversationId() {
  const matched = location.pathname.match(/chat\/([^/?#]+)/i)
  return matched?.[1]
}

function makeDedupeKey(text: string, conversationId?: string) {
  const prefix = conversationId || 'global'
  return `${prefix}::${cleanText(text).toLowerCase().slice(0, 220)}`
}

function genId() {
  return `db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function markAnchor(el: HTMLElement, preferId?: string) {
  try {
    const existed = el.getAttribute(ANCHOR_ATTR)
    if (existed) return existed
    const id = preferId || genId()
    el.setAttribute(ANCHOR_ATTR, id)
    return id
  } catch {
    return preferId || genId()
  }
}

function isUserMessage(el: HTMLElement) {
  let cur: HTMLElement | null = el
  for (let i = 0; i < 12 && cur; i += 1) {
    const marker = [cur.className || '', cur.getAttribute('data-testid') || '', cur.getAttribute('data-role') || '']
      .join(' ')
      .toLowerCase()

    if (marker.includes('assist') || marker.includes('assistant') || marker.includes('receive') || marker.includes('bot')) {
      return false
    }

    if (marker.includes('send') || marker.includes('user') || marker.includes('human')) {
      return true
    }

    cur = cur.parentElement
  }

  return false
}

function extractMessageTime(node: HTMLElement): number | undefined {
  let cur: HTMLElement | null = node
  for (let i = 0; i < 10 && cur; i += 1) {
    const timeEl = cur.querySelector<HTMLElement>('time')
    if (timeEl) {
      const dateTime = (timeEl as HTMLTimeElement).dateTime || timeEl.getAttribute('datetime') || ''
      if (dateTime) {
        const ts = Date.parse(dateTime)
        if (!Number.isNaN(ts) && ts > 0) return ts
      }
    }
    cur = cur.parentElement
  }
  return undefined
}

function addHighlight(el: HTMLElement) {
  el.classList.add('doubao-assist-highlight')
  window.setTimeout(() => el.classList.remove('doubao-assist-highlight'), 1500)
}

function ensureHighlightStyle() {
  const id = 'doubao-assist-highlight-style'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `.doubao-assist-highlight{outline:3px solid rgba(255,183,0,.95)!important;border-radius:8px;}`
  document.head.appendChild(style)
}

function loadStorage(): Promise<QuestionItem[]> {
  return new Promise((resolve) => {
    if (!extAlive()) return resolve([])
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (res) => {
      resolve(Array.isArray(res[STORAGE_KEY]) ? (res[STORAGE_KEY] as QuestionItem[]) : [])
      })
    })
  }

function saveStorage(items: QuestionItem[]) {
  if (!extAlive()) return
  chrome.storage.local.set({ [STORAGE_KEY]: items.slice(0, STORAGE_MAX) })
  }

async function captureAllHistory() {
  const conversationId = getConversationId()
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(USER_TEXT_SELECTOR)).filter(isUserMessage)
  if (nodes.length === 0) return

  const existing = await loadStorage()
  const sameConv = existing.filter((q) => q.conversationId === conversationId)
  const otherConv = existing.filter((q) => q.conversationId !== conversationId)
  const oldMap = new Map(sameConv.map((q) => [q.dedupeKey, q]))

  const now = Date.now()
  const captured: QuestionItem[] = []
  let maxOrder = sameConv.reduce((max, item) => (typeof item.order === 'number' ? Math.max(max, item.order) : max), -1)

  const keysByDomIndex = nodes.map((node) => makeDedupeKey(cleanText(node.textContent || ''), conversationId))

  const resolveNewOrder = (domIndex: number) => {
    let prevOrder: number | undefined
    for (let i = domIndex - 1; i >= 0; i -= 1) {
      const prev = oldMap.get(keysByDomIndex[i])
      if (prev && typeof prev.order === 'number') {
        prevOrder = prev.order
        break
      }
    }

    let nextOrder: number | undefined
    for (let i = domIndex + 1; i < keysByDomIndex.length; i += 1) {
      const next = oldMap.get(keysByDomIndex[i])
      if (next && typeof next.order === 'number') {
        nextOrder = next.order
        break
      }
    }

    if (typeof prevOrder === 'number' && typeof nextOrder === 'number' && nextOrder > prevOrder) {
      return prevOrder + (nextOrder - prevOrder) / 2
    }

    if (typeof prevOrder === 'number') return prevOrder + 0.1
    if (typeof nextOrder === 'number') return nextOrder - 0.1

    maxOrder += 1
    return maxOrder
  }

  nodes.forEach((node, idx) => {
    const text = cleanText(node.textContent || '')
    if (text.length < 2) return

    const dedupeKey = makeDedupeKey(text, conversationId)
    const old = oldMap.get(dedupeKey)
    const anchorId = markAnchor(node, old?.qid)

    const msgTs = old?.timestamp || Number(node.getAttribute(TIME_ATTR) || 0) || extractMessageTime(node) || now + idx
    node.setAttribute(TIME_ATTR, String(msgTs))

    captured.push({
      qid: old?.qid || anchorId,
      text: text.slice(0, 300),
      timestamp: msgTs,
      pageUrl: location.href,
      anchorId,
      conversationId,
      dedupeKey,
      order: old?.order ?? resolveNewOrder(idx)
    })
  })

  const dedup = new Map<string, QuestionItem>()
  for (const item of [...captured, ...sameConv]) {
    if (!dedup.has(item.dedupeKey)) dedup.set(item.dedupeKey, item)
  }

  const mergedConv = Array.from(dedup.values()).sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER
    const bo = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return a.timestamp - b.timestamp
  })

  saveStorage([...mergedConv, ...otherConv].slice(0, STORAGE_MAX))
}

function scheduleCapture() {
  if (captureTimer) window.clearTimeout(captureTimer)
  captureTimer = window.setTimeout(() => void captureAllHistory(), 120)
}

function scrollToAnchor(qid: string) {
  let target = document.querySelector<HTMLElement>(`[${ANCHOR_ATTR}="${qid}"]`)
  if (!target) {
    const allUserNodes = Array.from(document.querySelectorAll<HTMLElement>(USER_TEXT_SELECTOR)).filter(isUserMessage)
    target = allUserNodes.find((node) => node.getAttribute(ANCHOR_ATTR) === qid) || null
  }
  if (!target) return false
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  addHighlight(target)
  return true
}

function listenJumpHandler(msg: any, _sender: chrome.runtime.MessageSender, sendResponse: (response: { ok: boolean }) => void) {
  try {
    if (!msg) {
      sendResponse({ ok: false })
      return true
    }

    if (msg.type === MSG_SCROLL_TO) {
      sendResponse({ ok: scrollToAnchor(msg.qid) })
      return true
    }

    if (msg.type === MSG_REFRESH_CAPTURE) {
      void captureAllHistory().then(() => sendResponse({ ok: true }))
      return true
    }

    sendResponse({ ok: false })
    return true
  } catch {
    sendResponse({ ok: false })
    return true
  }
}

function listenJump() {
  if (!extAlive()) return
  try {
    chrome.runtime.onMessage.removeListener(listenJumpHandler)
    chrome.runtime.onMessage.addListener(listenJumpHandler)
  } catch {}
}

function startObserver() {
  const ob = new MutationObserver(() => scheduleCapture())
  ob.observe(document.body, { childList: true, subtree: true })
  window.setInterval(() => void captureAllHistory(), 1200)
}

function start() {
  if (!location.hostname.includes('doubao.com')) return
  ensureHighlightStyle()
  listenJump()
  void captureAllHistory()
  startObserver()
}

if (document.readyState === 'complete' || document.readyState === 'interactive') start()
else document.addEventListener('DOMContentLoaded', start)
