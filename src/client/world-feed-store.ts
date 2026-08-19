import type {
  ArkmeAuthSnapshot,
  ArkmeProviderState,
} from '@senguoyun/dsh-arkme/sdk'
import type {
  ArkmeWorldFeedItem,
  ArkmeWorldFeedPage,
  ArkmeWorldProviderCapabilities,
} from './world-provider-client.js'

export interface WorldFeedClient {
  capabilities(signal?: AbortSignal): Promise<ArkmeWorldProviderCapabilities>
  authStatus(signal?: AbortSignal): Promise<ArkmeAuthSnapshot>
  worldFeed(options?: { limit?: number; offset?: number; signal?: AbortSignal }): Promise<ArkmeWorldFeedPage>
}

export type WorldFeedStatus =
  | 'idle'
  | 'checking'
  | 'loading'
  | 'unsupported'
  | 'unauthenticated'
  | 'error'
  | 'empty'
  | 'success'

export interface WorldFeedSnapshot {
  status: WorldFeedStatus
  items: ArkmeWorldFeedItem[]
  total: number
  hasMore: boolean
  nextOffset?: number
  error?: string
  incrementalError?: string
  refreshing: boolean
  loadingMore: boolean
}

const INITIAL_SNAPSHOT: WorldFeedSnapshot = {
  status: 'idle',
  items: [],
  total: 0,
  hasMore: false,
  refreshing: false,
  loadingMore: false,
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : '世界暂时无法加载，请稍后重试'
}

export class WorldFeedStore {
  private snapshot: WorldFeedSnapshot = INITIAL_SNAPSHOT
  private readonly listeners = new Set<() => void>()
  private loadController: AbortController | undefined
  private pageController: AbortController | undefined
  private loadInFlight: Promise<void> | undefined
  private refreshInFlight: Promise<void> | undefined
  private pageInFlight: Promise<void> | undefined
  private accountKey: string | undefined

  constructor(private readonly client: WorldFeedClient) {}

  getSnapshot = (): WorldFeedSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  load(): Promise<void> {
    if (this.loadInFlight !== undefined) return this.loadInFlight
    let tracked: Promise<void>
    tracked = this.runLoad().finally(() => {
      if (this.loadInFlight === tracked) this.loadInFlight = undefined
    })
    this.loadInFlight = tracked
    return tracked
  }

  refresh(): Promise<void> {
    if (this.refreshInFlight !== undefined) return this.refreshInFlight
    if (this.snapshot.status !== 'success' && this.snapshot.status !== 'empty') return this.load()
    this.pageController?.abort()
    const { incrementalError: _incrementalError, ...refreshingSnapshot } = this.snapshot
    this.setSnapshot({ ...refreshingSnapshot, refreshing: true })
    const controller = new AbortController()
    this.loadController?.abort()
    this.loadController = controller
    let tracked: Promise<void>
    tracked = this.client.worldFeed({ limit: 20, offset: 0, signal: controller.signal })
      .then(page => { this.applyPage(page, false) })
      .catch(error => {
        if (!controller.signal.aborted) {
          this.setSnapshot({ ...this.snapshot, refreshing: false, incrementalError: errorMessage(error) })
        }
      })
      .finally(() => {
        if (this.loadController === controller) this.loadController = undefined
        if (this.refreshInFlight === tracked) this.refreshInFlight = undefined
      })
    this.refreshInFlight = tracked
    return tracked
  }

  loadMore(): Promise<void> {
    if (this.pageInFlight !== undefined) return this.pageInFlight
    if (this.snapshot.status !== 'success' || !this.snapshot.hasMore || this.snapshot.nextOffset === undefined
      || this.snapshot.refreshing) return Promise.resolve()
    const controller = new AbortController()
    this.pageController = controller
    const { incrementalError: _incrementalError, ...loadingSnapshot } = this.snapshot
    this.setSnapshot({ ...loadingSnapshot, loadingMore: true })
    let tracked: Promise<void>
    tracked = this.client.worldFeed({
      limit: 20,
      offset: this.snapshot.nextOffset,
      signal: controller.signal,
    }).then(page => { this.applyPage(page, true) })
      .catch(error => {
        if (!controller.signal.aborted) {
          this.setSnapshot({ ...this.snapshot, loadingMore: false, incrementalError: errorMessage(error) })
        }
      })
      .finally(() => {
        if (this.pageController === controller) this.pageController = undefined
        if (this.pageInFlight === tracked) this.pageInFlight = undefined
      })
    this.pageInFlight = tracked
    return tracked
  }

  reconcileProviderState(state: ArkmeProviderState): void {
    const nextKey = `${state.authStatus}:${String(state.userId ?? '')}`
    if (this.accountKey === undefined) {
      this.accountKey = nextKey
      return
    }
    if (this.accountKey === nextKey) return
    this.accountKey = nextKey
    this.reset()
  }

  reset(): void {
    this.loadController?.abort()
    this.pageController?.abort()
    this.loadController = undefined
    this.pageController = undefined
    this.loadInFlight = undefined
    this.refreshInFlight = undefined
    this.pageInFlight = undefined
    this.setSnapshot(INITIAL_SNAPSHOT)
  }

  private async runLoad(): Promise<void> {
    this.loadController?.abort()
    this.pageController?.abort()
    const controller = new AbortController()
    this.loadController = controller
    this.setSnapshot({ ...INITIAL_SNAPSHOT, status: 'checking' })
    try {
      const capabilities = await this.client.capabilities(controller.signal)
      if (capabilities.features.worldFeed !== true) {
        this.setSnapshot({ ...INITIAL_SNAPSHOT, status: 'unsupported' })
        return
      }
      const auth = await this.client.authStatus(controller.signal)
      this.accountKey = `${auth.status}:${String(auth.userId ?? '')}`
      if (auth.status !== 'authenticated') {
        this.setSnapshot({ ...INITIAL_SNAPSHOT, status: 'unauthenticated' })
        return
      }
      this.setSnapshot({ ...INITIAL_SNAPSHOT, status: 'loading' })
      const page = await this.client.worldFeed({ limit: 20, offset: 0, signal: controller.signal })
      this.applyPage(page, false)
    } catch (error) {
      if (!controller.signal.aborted) {
        this.setSnapshot({ ...INITIAL_SNAPSHOT, status: 'error', error: errorMessage(error) })
      }
    } finally {
      if (this.loadController === controller) this.loadController = undefined
    }
  }

  private applyPage(page: ArkmeWorldFeedPage, append: boolean): void {
    const byRef = new Map<string, ArkmeWorldFeedItem>()
    if (append) for (const item of this.snapshot.items) byRef.set(item.recordRef, item)
    for (const item of page.items) byRef.set(item.recordRef, item)
    const items = [...byRef.values()]
    this.setSnapshot({
      status: items.length === 0 ? 'empty' : 'success',
      items,
      total: page.total,
      hasMore: page.hasMore,
      ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
      refreshing: false,
      loadingMore: false,
    })
  }

  private setSnapshot(snapshot: WorldFeedSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}
