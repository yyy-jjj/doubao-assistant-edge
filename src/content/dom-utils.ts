export function genQid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function addHighlight(el: Element) {
  const target = el as HTMLElement
  target.classList.add('doubao-assist-highlight')
  window.setTimeout(() => target.classList.remove('doubao-assist-highlight'), 1800)
}

export function ensureHighlightStyle() {
  const styleId = 'doubao-assist-highlight-style'
  if (document.getElementById(styleId)) return

  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    .doubao-assist-highlight {
      outline: 3px solid rgba(255, 180, 0, 0.95) !important;
      border-radius: 8px;
      transition: outline-color 0.25s ease;
    }
  `

  document.head.appendChild(style)
}
