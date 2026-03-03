import { h, render } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { QuestionItem } from '../shared/types'
import { MSG_SCROLL_TO } from '../shared/message'

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function markKeyword(text: string, keyword: string) {
  if (!keyword.trim()) return escapeHtml(text)
  const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escapeHtml(text).replace(new RegExp(`(${safe})`, 'ig'), '<mark>$1</mark>')
}

function getCurrentConversationIdFromActiveTab(cb: (id?: string) => void) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    const url = tab?.url || ''
    const matched = url.match(/chat\/([^/?#]+)/i)
    cb(matched?.[1])
  })
}

function getOrderValue(item: QuestionItem) {
  return typeof item.order === 'number' ? item.order : Number.MAX_SAFE_INTEGER
}

function App() {
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [activeQid, setActiveQid] = useState('')
  const [notice, setNotice] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [sortMode, setSortMode] = useState<'asc' | 'desc'>('desc')
  const didAutoRefreshRef = useRef(false)

  const loadQuestions = () => {
    if (!conversationId) {
      setQuestions([])
      setNotice('未识别到对话ID，请先进入一个具体豆包对话页面')
      return
    }

    chrome.storage.local.get({ questions: [] }, (res) => {
      const all = Array.isArray(res.questions) ? (res.questions as QuestionItem[]) : []
      const list = all.filter((q) => q.conversationId === conversationId)
      setQuestions(list)
      setNotice(`本地记录：${list.length} 条`)
    })
  }

  useEffect(() => {
    getCurrentConversationIdFromActiveTab((id) => setConversationId(id))

    if (didAutoRefreshRef.current) return
    didAutoRefreshRef.current = true

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id || !tab.url?.includes('www.doubao.com')) return

      setNotice('已打开插件，正在自动刷新豆包页面...')
      chrome.tabs.reload(tab.id, {}, () => {
        void chrome.runtime.lastError
        window.setTimeout(() => {
          getCurrentConversationIdFromActiveTab((id) => setConversationId(id))
          loadQuestions()
        }, 900)
      })
    })
  }, [])

  useEffect(() => {
    if (!chrome?.runtime?.id) return

    loadQuestions()

    const timer = window.setInterval(() => {
      getCurrentConversationIdFromActiveTab((id) => setConversationId(id))
      loadQuestions()
    }, 1000)

    const onChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
      if (areaName === 'local' && changes.questions) loadQuestions()
    }

    chrome.storage.onChanged.addListener(onChange)

    return () => {
      window.clearInterval(timer)
      chrome.storage.onChanged.removeListener(onChange)
    }
  }, [conversationId])

  const filtered = useMemo(() => {
    const key = keyword.trim().toLowerCase()
    const base = key ? questions.filter((q) => q.text.toLowerCase().includes(key)) : questions

    return [...base].sort((a, b) => {
      const ao = getOrderValue(a)
      const bo = getOrderValue(b)
      if (ao !== bo) return sortMode === 'asc' ? ao - bo : bo - ao
      return sortMode === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
    })
  }, [questions, keyword, sortMode])

  const jumpTo = (item: QuestionItem) => {
    setActiveQid(item.qid)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        setActiveQid('')
        return
      }

      chrome.tabs.sendMessage(tab.id, { type: MSG_SCROLL_TO, qid: item.qid }, (res) => {
        void chrome.runtime.lastError
        if (!res?.ok) setNotice(`跳转失败：未找到锚点 ${item.qid}`)
        setTimeout(() => setActiveQid(''), 1200)
      })
    })
  }

  return (
    <main class="app">
      <div class="search-wrap">
        <span class="search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          class="search"
          value={keyword}
          onInput={(e) => setKeyword((e.target as HTMLInputElement).value)}
          placeholder="搜索历史问题"
        />
      </div>

      <div class="toolbar">
        <button class="sort-btn" onClick={() => setSortMode((m) => (m === 'asc' ? 'desc' : 'asc'))}>
          排序：{sortMode === 'asc' ? '正序' : '倒序'}
        </button>
      </div>

      <div class="meta-wrap">
        <div class="meta">匹配 {filtered.length} 条</div>
        <div class="meta">{notice}</div>
      </div>

      <section class="list">
        {filtered.length === 0 ? (
          <div class="empty">
            <div class="empty-icon">?</div>
            <div class="empty-text">暂无问题，去豆包提问后会自动出现在这里</div>
          </div>
        ) : (
          filtered.map((item) => (
            <button
              class={`item ${activeQid === item.qid ? 'active' : ''}`}
              onClick={() => jumpTo(item)}
              title="点击跳转至对应提问位置"
            >
              <div class="text" dangerouslySetInnerHTML={{ __html: markKeyword(item.text, keyword) }} />
            </button>
          ))
        )}
      </section>
    </main>
  )
}

render(h(App, {}), document.getElementById('app') as HTMLElement)
