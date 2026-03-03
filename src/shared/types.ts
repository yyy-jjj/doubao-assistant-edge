export interface QuestionItem {
  qid: string
  text: string
  timestamp: number
  pageUrl: string
  anchorId: string
  conversationId?: string
  dedupeKey: string
  order?: number
}

export interface NewQuestionPayload {
  text: string
  pageUrl: string
  anchorId: string
  conversationId?: string
  dedupeKey: string
  timestamp: number
}
