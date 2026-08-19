import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createArkmeSdk } from '@senguoyun/dsh-arkme/sdk'
import { WorldFeedStore, type WorldFeedSnapshot } from './world-feed-store.js'
import {
  createWorldProviderClient,
  type ArkmeWorldFeedItem,
  type WorldProviderClient,
} from './world-provider-client.js'
import { WorldSurface } from './WorldSurface.js'
import css from './world.module.css'

export type WorldFooterEntryProps = PropsRuntime<'sidebar.footer.action'>

const worldImageCache = new Map<string, string>()
const WORLD_IMAGE_CACHE_LIMIT = 24
const PHONE_DEFAULT_AVATAR_COLORS = [
  '#2bb673', '#2f80ed', '#f2994a', '#eb5757', '#9b51e0', '#00a6a6',
  '#6fcf97', '#56ccf2', '#f2c94c', '#bb6bd9', '#4f4f4f', '#27ae60',
] as const

function cacheWorldImage(imageRef: string, source: string): void {
  worldImageCache.delete(imageRef)
  worldImageCache.set(imageRef, source)
  while (worldImageCache.size > WORLD_IMAGE_CACHE_LIMIT) {
    const oldest = worldImageCache.keys().next().value as string | undefined
    if (oldest === undefined) break
    worldImageCache.delete(oldest)
  }
}

function WorldImage({ sdk, imageRef, alt, className, eager = false, fallback, onActivate, renderFailure }: {
  sdk: WorldProviderClient
  imageRef: string
  alt: string
  className: string
  eager?: boolean
  fallback?: ReactNode
  onActivate?: (trigger: HTMLButtonElement) => void
  renderFailure?: (retry: () => void) => ReactNode
}) {
  const placeholder = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(eager || worldImageCache.has(imageRef))
  const [source, setSource] = useState(worldImageCache.get(imageRef) ?? '')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (visible || eager) return
    const element = placeholder.current
    if (element === null || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '240px 0px' })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [eager, visible])
  useEffect(() => {
    const cached = worldImageCache.get(imageRef)
    if (cached !== undefined) {
      setSource(cached)
      setFailed(false)
      return
    }
    if (!visible) return
    const controller = new AbortController()
    setSource('')
    setFailed(false)
    void sdk.readWorldImage(imageRef, controller.signal)
      .then(image => {
        if (controller.signal.aborted) return
        const nextSource = sdk.imageDataUrl(image)
        cacheWorldImage(imageRef, nextSource)
        setSource(nextSource)
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort() }
  }, [attempt, imageRef, sdk, visible])
  const retry = () => {
    worldImageCache.delete(imageRef)
    setFailed(false)
    setSource('')
    setVisible(true)
    setAttempt(value => value + 1)
  }
  if (failed) {
    if (renderFailure !== undefined) return renderFailure(retry)
    if (fallback !== undefined) return fallback
    return <span className={`${className} ${css.imageFailure}`} aria-label={`${alt}加载失败`}>图片加载失败</span>
  }
  if (source === '') return <span ref={placeholder} className={`${className} ${css.imagePlaceholder}`} aria-label={`${alt}加载中`} />
  const image = <img
    className={className}
    src={source}
    alt={alt}
    loading={eager ? 'eager' : 'lazy'}
    onError={() => {
      worldImageCache.delete(imageRef)
      setSource('')
      setFailed(true)
    }}
  />
  if (onActivate === undefined) return image
  return <button
    type="button"
    className={css.imageButton}
    aria-label={`预览${alt}`}
    onClick={event => { onActivate(event.currentTarget) }}
  >{image}</button>
}

function timeLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  const date = new Date(value)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat('zh-CN', sameYear
    ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
    : { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date)
}

function WorldAvatarFallback({ item }: { item: ArkmeWorldFeedItem }) {
  if (item.avatarFallback?.kind === 'phone_default') return <span
    className={`${css.avatarFallback} ${css.phoneDefaultAvatar}`}
    style={{ backgroundColor: PHONE_DEFAULT_AVATAR_COLORS[Math.abs(item.avatarFallback.colorIndex) % PHONE_DEFAULT_AVATAR_COLORS.length] }}
    aria-hidden
  >{item.avatarFallback.label}</span>
  return <span className={css.avatarFallback} aria-hidden>{item.authorName.slice(0, 1)}</span>
}

function WorldCard({ sdk, item, onPreview }: {
  sdk: WorldProviderClient
  item: ArkmeWorldFeedItem
  onPreview(imageRefs: string[], authorName: string, index: number, trigger: HTMLButtonElement): void
}) {
  const body = item.textContent.trim()
  const mediaLabels = [
    item.imageCount > item.imageRefs.length ? `${String(item.imageCount)} 张图片` : '',
    item.videoCount > 0 ? `${String(item.videoCount)} 个视频` : '',
    item.voiceCount > 0 ? `${String(item.voiceCount)} 条语音` : '',
  ].filter(label => label !== '')
  return <article className={css.card} data-record-ref={item.recordRef}>
    <header className={css.cardHeader}>
      {item.avatarRef !== undefined
        ? <WorldImage
          sdk={sdk}
          imageRef={item.avatarRef}
          alt={`${item.authorName}的头像`}
          className={css.avatar!}
          eager
          fallback={<WorldAvatarFallback item={item} />}
        />
        : <WorldAvatarFallback item={item} />}
      <span className={css.authorBlock}>
        <strong className={css.author}>{item.authorName}</strong>
        <time className={css.time}>{timeLabel(item.publishedAtMillis || item.createdAtMillis)}</time>
      </span>
    </header>
    {item.headline !== '' && <h2 className={css.headline}>{item.headline}</h2>}
    {body !== '' && <p className={css.body}>{body}</p>}
    {item.imageRefs.length > 0 && <div className={css.imageGrid} data-count={Math.min(3, item.imageRefs.length)}>
      {item.imageRefs.slice(0, 3).map((imageRef, index) => <WorldImage
        key={imageRef}
        sdk={sdk}
        imageRef={imageRef}
        alt={`${item.authorName}发布的图片 ${String(index + 1)}`}
        className={css.worldImage!}
        onActivate={trigger => { onPreview(item.imageRefs, item.authorName, index, trigger) }}
        renderFailure={retry => <button type="button" className={`${css.worldImage} ${css.imageRetry}`} onClick={retry}>
          图片加载失败，点击重试
        </button>}
      />)}
    </div>}
    {(mediaLabels.length > 0 || item.extendCount > 0) && <footer className={css.cardFooter}>
      <span>{mediaLabels.join(' · ')}</span>
      {item.extendCount > 0 && <span>{item.extendCount} 条互动</span>}
    </footer>}
  </article>
}

export function calculateWorldPreviewIndex(current: number, count: number, direction: -1 | 1): number {
  if (!Number.isInteger(current) || count <= 0) return 0
  return Math.min(count - 1, Math.max(0, current + direction))
}

export function WorldImagePreview({ sdk, imageRefs, authorName, activeIndex, onClose, onMove }: {
  sdk: WorldProviderClient
  imageRefs: string[]
  authorName: string
  activeIndex: number
  onClose(): void
  onMove(direction: -1 | 1): void
}) {
  const index = Math.min(Math.max(0, activeIndex), Math.max(0, imageRefs.length - 1))
  const imageRef = imageRefs[index]
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault()
        onMove(-1)
      } else if (event.key === 'ArrowRight' && index < imageRefs.length - 1) {
        event.preventDefault()
        onMove(1)
      } else if (event.key === 'Tab') {
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (buttons === undefined || buttons.length === 0) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [imageRefs.length, index, onClose, onMove])
  if (imageRef === undefined) return null
  return <div
    className={css.previewBackdrop}
    data-world-image-preview="true"
    role="dialog"
    aria-modal="true"
    aria-label="图片预览"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
  >
    <div ref={panel} className={css.previewPanel}>
      <header className={css.previewHeader}>
        <span aria-live="polite">{authorName} · {index + 1} / {imageRefs.length}</span>
        <button type="button" autoFocus onClick={onClose}>关闭</button>
      </header>
      <div className={css.previewStage}>
        <button type="button" className={css.previewNav} disabled={index === 0} onClick={() => { onMove(-1) }}>上一张</button>
        <WorldImage
          key={imageRef}
          sdk={sdk}
          imageRef={imageRef}
          alt={`${authorName}发布的图片 ${String(index + 1)}`}
          className={css.previewImage!}
          eager
          renderFailure={retry => <div className={css.previewFailure} role="alert">
            <span>图片加载失败</span>
            <button type="button" onClick={retry}>重试</button>
          </div>}
        />
        <button type="button" className={css.previewNav} disabled={index === imageRefs.length - 1} onClick={() => { onMove(1) }}>下一张</button>
      </div>
    </div>
  </div>
}

export function WorldStateView({ sdk, store, snapshot }: {
  sdk: WorldProviderClient
  store: WorldFeedStore
  snapshot: WorldFeedSnapshot
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const previewTrigger = useRef<HTMLButtonElement>()
  const [preview, setPreview] = useState<{ imageRefs: string[]; authorName: string; activeIndex: number }>()
  const closePreview = () => {
    setPreview(undefined)
    window.requestAnimationFrame(() => { previewTrigger.current?.focus() })
  }
  useEffect(() => {
    if (snapshot.status !== 'success' || !snapshot.hasMore || typeof IntersectionObserver === 'undefined') return
    const element = sentinel.current
    if (element === null) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void store.loadMore()
    }, { rootMargin: '240px 0px' })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [snapshot.hasMore, snapshot.status, store])
  useEffect(() => {
    if (snapshot.status !== 'success') setPreview(undefined)
  }, [snapshot.status])

  if (snapshot.status === 'idle' || snapshot.status === 'checking' || snapshot.status === 'loading') {
    return <div className={css.skeletonList} aria-label="世界加载中">
      {[0, 1, 2].map(index => <div key={index} className={css.skeletonCard} />)}
    </div>
  }
  if (snapshot.status === 'unsupported') return <WorldMessage
    eyebrow="版本暂不支持"
    title="升级 Arkme 插件后查看世界"
    detail="当前 Provider 还没有桌面世界能力。升级不会影响已有 Arkme 会话。"
    action="重新检测"
    onAction={() => { void store.load() }}
  />
  if (snapshot.status === 'unauthenticated') return <WorldMessage
    eyebrow="需要登录"
    title="先从左侧 Arkme 入口完成登录"
    detail="世界内容通过同一个 Arkme 账号读取，本插件不会单独保存登录凭据。"
    action="登录后重试"
    onAction={() => { void store.load() }}
  />
  if (snapshot.status === 'error') return <WorldMessage
    eyebrow="暂时无法连接"
    title="世界没有加载出来"
    detail={snapshot.error ?? '请检查网络后重试。'}
    action="重试"
    onAction={() => { void store.load() }}
  />
  if (snapshot.status === 'empty') return <WorldMessage
    eyebrow="公开世界"
    title="这里暂时还没有内容"
    detail="稍后刷新看看新的公开记录。"
    action="刷新"
    onAction={() => { void store.refresh() }}
  />
  return <div className={css.feed}>
    {snapshot.incrementalError !== undefined && <div className={css.retryBanner} role="status">
      <span>{snapshot.incrementalError}</span>
      <button type="button" onClick={() => { void (snapshot.hasMore ? store.loadMore() : store.refresh()) }}>重试</button>
    </div>}
    <div className={css.cardList}>
      {snapshot.items.map(item => <WorldCard
        key={item.recordRef}
        sdk={sdk}
        item={item}
        onPreview={(imageRefs, authorName, activeIndex, trigger) => {
          previewTrigger.current = trigger
          setPreview({ imageRefs, authorName, activeIndex })
        }}
      />)}
    </div>
    <div ref={sentinel} className={css.loadMore}>
      {snapshot.hasMore
        ? <button type="button" disabled={snapshot.loadingMore} onClick={() => { void store.loadMore() }}>
          {snapshot.loadingMore ? '正在加载更多…' : '加载更多'}
        </button>
        : <span>已经看到这里了</span>}
    </div>
    {preview !== undefined && <WorldImagePreview
      sdk={sdk}
      imageRefs={preview.imageRefs}
      authorName={preview.authorName}
      activeIndex={preview.activeIndex}
      onClose={closePreview}
      onMove={direction => {
        setPreview(current => current === undefined ? current : {
          ...current,
          activeIndex: calculateWorldPreviewIndex(current.activeIndex, current.imageRefs.length, direction),
        })
      }}
    />}
  </div>
}

function WorldMessage({ eyebrow, title, detail, action, onAction }: {
  eyebrow: string
  title: string
  detail: string
  action: string
  onAction(): void
}) {
  return <div className={css.message}>
    <span className={css.messageEyebrow}>{eyebrow}</span>
    <h2>{title}</h2>
    <p>{detail}</p>
    <button type="button" onClick={onAction}>{action}</button>
  </div>
}

export function WorldFooterEntry(props: WorldFooterEntryProps) {
  const sdk = useMemo(() => createWorldProviderClient(createArkmeSdk()), [])
  const store = useMemo(() => new WorldFeedStore(sdk), [sdk])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [open, setOpen] = useState(false)
  const currentSession = props.useSessions(state => state.current)
  const openedFromSession = useRef(currentSession)

  useEffect(() => {
    if (!open) return
    const unsubscribe = sdk.subscribe(state => { store.reconcileProviderState(state) }, { intervalMs: 1_000 })
    return unsubscribe
  }, [open, sdk, store])
  useEffect(() => {
    if (open && snapshot.status === 'idle') void store.load()
  }, [open, snapshot.status, store])
  useEffect(() => {
    if (open && currentSession !== openedFromSession.current) {
      setOpen(false)
      store.reset()
    }
  }, [currentSession, open, store])
  useEffect(() => () => { store.reset() }, [store])

  const toggle = () => {
    if (open) {
      setOpen(false)
      store.reset()
      return
    }
    openedFromSession.current = currentSession
    setOpen(true)
    void store.load()
  }
  return <>
    <button
      type="button"
      className={`${css.footerButton} ${props.wide ? css.footerButtonWide : css.footerButtonRail}`}
      aria-label="世界"
      aria-expanded={open}
      title={props.wide ? undefined : '世界'}
      onClick={toggle}
    >
      <span className={css.worldMark} aria-hidden>世</span>
      {props.wide && <span className={css.footerLabel}>世界</span>}
    </button>
    {open && <WorldSurface
      close={() => { setOpen(false); store.reset() }}
      refresh={() => { void store.refresh() }}
      refreshing={snapshot.refreshing}
      openedFromSession={openedFromSession.current}
      useSessions={props.useSessions}
    >
      <WorldStateView sdk={sdk} store={store} snapshot={snapshot} />
    </WorldSurface>}
  </>
}
