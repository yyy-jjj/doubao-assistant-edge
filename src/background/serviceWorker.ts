import { MSG_GET_QUESTIONS, MSG_NEW_QUESTION } from '../shared/message'
import type { NewQuestionPayload, QuestionItem } from '../shared/types'

const STORAGE_KEY = 'questions'
const MAX_QUESTIONS = 1500
const SIDEBAR_PATH = 'dist/src/sidebar/index.html'

function buildQid(payload: NewQuestionPayload) {
  return payload.anchorId
}

function isSameQuestion(a: QuestionItem, b: NewQuestionPayload) {
  return a.dedupeKey === b.dedupeKey && a.conversationId === b.conversationId
}

function isDoubaoUrl(url?: string) {
  if (!url) return false
  return /^https:\/\/www\.doubao\.com\//.test(url)
}

function syncSidePanelForTab(tabId: number, url?: string) {
  const enabled = isDoubaoUrl(url)

  chrome.sidePanel.setOptions({
    tabId,
    path: SIDEBAR_PATH,
    enabled
  })

  if (enabled) {
    chrome.sidePanel.open({ tabId }, () => {
      void chrome.runtime.lastError
    })
  }
}

function syncAllTabsSidePanel() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (typeof tab.id !== 'number') return
      syncSidePanelForTab(tab.id, tab.url)
    })
  })
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  syncAllTabsSidePanel()
})

chrome.runtime.onStartup.addListener(() => {
  syncAllTabsSidePanel()
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const nextUrl = changeInfo.url ?? tab.url
  syncSidePanelForTab(tabId, nextUrl)
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return
    syncSidePanelForTab(tabId, tab.url)
  })
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg?.type) return

  if (msg.type === MSG_NEW_QUESTION) {
    const payload = msg.payload as NewQuestionPayload

    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (res) => {
      const current = (res[STORAGE_KEY] || []) as QuestionItem[]
      const exists = current.some((item) => isSameQuestion(item, payload))
      if (exists) return

      const next: QuestionItem[] = [
        {
          qid: buildQid(payload),
          text: payload.text,
          timestamp: payload.timestamp,
          pageUrl: payload.pageUrl,
          anchorId: payload.anchorId,
          conversationId: payload.conversationId,
          dedupeKey: payload.dedupeKey
        },
        ...current
      ]

      if (next.length > MAX_QUESTIONS) next.length = MAX_QUESTIONS
      chrome.storage.local.set({ [STORAGE_KEY]: next })
    })

    return
  }

  if (msg.type === MSG_GET_QUESTIONS) {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (res) => {
      sendResponse({ questions: (res[STORAGE_KEY] || []) as QuestionItem[] })
    })
    return true
  }
})
