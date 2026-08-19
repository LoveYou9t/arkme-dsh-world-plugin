import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './world.module.css'

export interface WorldFrame { left: number; top: number; width: number; height: number }

export const WORLD_BRAND_LABEL = 'ARKME WORLD'

export function calculateWorldFrame(bounds: { left: number; top: number; width: number; height: number }): WorldFrame {
  const inset = 14
  return {
    left: bounds.left + inset,
    top: bounds.top + inset,
    width: Math.max(0, bounds.width - inset * 2),
    height: Math.max(0, bounds.height - inset * 2),
  }
}

function conversationFrameElement(): HTMLElement | undefined {
  let element = document.querySelector<HTMLElement>('[data-slot="conversation"]')?.parentElement
  while (element !== null && element !== undefined) {
    const bounds = element.getBoundingClientRect()
    if (bounds.width > 0 && bounds.height > 0) return element
    element = element.parentElement
  }
  return undefined
}

export function WorldSurface({
  children, close, refresh, refreshing, openedFromSession, useSessions,
}: {
  children: ReactNode
  close(): void
  refresh(): void
  refreshing: boolean
  openedFromSession: SessionId | undefined
  useSessions: PropsRuntime<'sidebar.footer.action'>['useSessions']
}) {
  const currentSession = useSessions(state => state.current)
  const [frame, setFrame] = useState<WorldFrame>()
  useEffect(() => { if (currentSession !== openedFromSession) close() }, [close, currentSession, openedFromSession])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('[data-world-image-preview="true"]') === null) close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [close])
  useLayoutEffect(() => {
    const element = conversationFrameElement()
    if (element === undefined) return
    const update = () => { setFrame(calculateWorldFrame(element.getBoundingClientRect())) }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [])
  if (frame === undefined) return null
  return createPortal(<section className={css.surface} style={frame} role="dialog" aria-label="Arkme 世界">
    <header className={css.surfaceHeader}>
      <span className={css.kicker}>{WORLD_BRAND_LABEL}</span>
      <h1>世界</h1>
      <span className={css.headerRule} />
      <button type="button" disabled={refreshing} onClick={refresh}>{refreshing ? '刷新中…' : '刷新'}</button>
      <button type="button" onClick={close}>关闭</button>
    </header>
    <main className={css.surfaceBody}>{children}</main>
  </section>, document.body)
}
