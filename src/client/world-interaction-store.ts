import type {
  ArkmeWorldInteractionCreateResult,
  ArkmeWorldInteractionItem,
  ArkmeWorldInteractionPage,
  ArkmeWorldProviderCapabilities,
} from './world-provider-client.js'

export interface WorldInteractionClient {
  capabilities(signal?: AbortSignal): Promise<ArkmeWorldProviderCapabilities>
  worldInteractions(
    recordRef: string,
    options?: { limit?: number; offset?: number; signal?: AbortSignal },
  ): Promise<ArkmeWorldInteractionPage>
  createWorldTextInteraction(input: {
    targetRef: string
    textContent: string
    clientMutationId: string
    signal?: AbortSignal
  }): Promise<ArkmeWorldInteractionCreateResult>
}

export type WorldInteractionStatus = 'idle' | 'loading' | 'unsupported' | 'error' | 'empty' | 'success'

export interface WorldInteractionReplyTarget {
  interactionRef: string
  authorName: string
}

export interface WorldInteractionSnapshot {
  status: WorldInteractionStatus
  rootRef?: string
  items: ArkmeWorldInteractionItem[]
  total: number
  hasMore: boolean
  nextOffset?: number
  error?: string
  draft: string
  replyTarget?: WorldInteractionReplyTarget
  sending: boolean
  sendError?: string
  loadingMore: boolean
  incrementalError?: string
}

function initialSnapshot(): WorldInteractionSnapshot {
  return { status: 'idle', items: [], total: 0, hasMore: false, draft: '', sending: false, loadingMore: false }
}

function interactionError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : fallback
}

function mutationId(): string {
  return `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

export class WorldInteractionStore {
  private snapshot = initialSnapshot()
  private readonly listeners = new Set<() => void>()
  private loadController: AbortController | undefined
  private loadInFlight: Promise<void> | undefined
  private loadTarget: string | undefined
  private pageController: AbortController | undefined
  private pageInFlight: Promise<void> | undefined
  private sendInFlight: Promise<void> | undefined
  private sendController: AbortController | undefined
  private pendingMutationId: string | undefined

  constructor(private readonly client: WorldInteractionClient) {}

  getSnapshot = (): WorldInteractionSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  open(recordRef: string): Promise<void> {
    const normalized = recordRef.trim()
    if (this.loadInFlight !== undefined && this.loadTarget === normalized) return this.loadInFlight
    this.loadController?.abort()
    this.pageController?.abort()
    this.pageController = undefined
    this.pageInFlight = undefined
    this.sendController?.abort()
    this.sendController = undefined
    this.sendInFlight = undefined
    this.pendingMutationId = undefined
    const controller = new AbortController()
    this.loadController = controller
    this.loadTarget = normalized
    this.setSnapshot({ ...initialSnapshot(), status: 'loading', rootRef: normalized })
    let tracked: Promise<void>
    tracked = this.runOpen(normalized, controller).finally(() => {
      if (this.loadController === controller) this.loadController = undefined
      if (this.loadInFlight === tracked) {
        this.loadInFlight = undefined
        this.loadTarget = undefined
      }
    })
    this.loadInFlight = tracked
    return tracked
  }

  setDraft(draft: string): void {
    const { sendError: _sendError, ...rest } = this.snapshot
    this.pendingMutationId = undefined
    this.setSnapshot({ ...rest, draft })
  }

  loadMore(): Promise<void> {
    if (this.pageInFlight !== undefined) return this.pageInFlight
    const rootRef = this.snapshot.rootRef
    const offset = this.snapshot.nextOffset
    if (rootRef === undefined || offset === undefined || !this.snapshot.hasMore || this.snapshot.loadingMore) {
      return Promise.resolve()
    }
    const controller = new AbortController()
    this.pageController = controller
    const { incrementalError: _incrementalError, ...loadingSnapshot } = this.snapshot
    this.setSnapshot({ ...loadingSnapshot, loadingMore: true })
    let tracked: Promise<void>
    tracked = this.client.worldInteractions(rootRef, { limit: 50, offset, signal: controller.signal })
      .then(page => {
        if (controller.signal.aborted) return
        const byRef = new Map(this.snapshot.items.map(item => [item.interactionRef, item]))
        for (const item of page.items) byRef.set(item.interactionRef, item)
        this.setSnapshot({
          ...this.snapshot,
          items: [...byRef.values()],
          total: page.total,
          hasMore: page.hasMore,
          ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
          loadingMore: false,
        })
      })
      .catch(error => {
        if (controller.signal.aborted) return
        this.setSnapshot({
          ...this.snapshot,
          loadingMore: false,
          incrementalError: interactionError(error, '更多互动加载失败，请重试'),
        })
      })
      .finally(() => {
        if (this.pageController === controller) this.pageController = undefined
        if (this.pageInFlight === tracked) this.pageInFlight = undefined
      })
    this.pageInFlight = tracked
    return tracked
  }

  setReplyTarget(replyTarget: WorldInteractionReplyTarget): void {
    const { sendError: _sendError, ...rest } = this.snapshot
    this.pendingMutationId = undefined
    this.setSnapshot({ ...rest, replyTarget })
  }

  clearReplyTarget(): void {
    const { replyTarget: _replyTarget, sendError: _sendError, ...rest } = this.snapshot
    this.pendingMutationId = undefined
    this.setSnapshot(rest)
  }

  submit(): Promise<void> {
    if (this.sendInFlight !== undefined) return this.sendInFlight
    const rootRef = this.snapshot.rootRef
    const textContent = this.snapshot.draft.trim()
    if (rootRef === undefined || textContent === '') return Promise.resolve()
    const targetRef = this.snapshot.replyTarget?.interactionRef ?? rootRef
    const clientMutationId = this.pendingMutationId ?? mutationId()
    this.pendingMutationId = clientMutationId
    const controller = new AbortController()
    this.sendController = controller
    const { sendError: _sendError, ...sendingSnapshot } = this.snapshot
    this.setSnapshot({ ...sendingSnapshot, sending: true })
    let tracked: Promise<void>
    tracked = this.client.createWorldTextInteraction({ targetRef, textContent, clientMutationId, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        const byRef = new Map(this.snapshot.items.map(item => [item.interactionRef, item]))
        byRef.set(result.interaction.interactionRef, result.interaction)
        const items = [...byRef.values()]
        this.pendingMutationId = undefined
        this.setSnapshot({
          status: 'success',
          rootRef,
          items,
          total: Math.max(this.snapshot.total, items.filter(item => item.parentRef === rootRef).length),
          hasMore: this.snapshot.hasMore,
          ...(this.snapshot.nextOffset === undefined ? {} : { nextOffset: this.snapshot.nextOffset }),
          draft: '',
          sending: false,
          loadingMore: false,
        })
      })
      .catch(error => {
        if (controller.signal.aborted) return
        this.setSnapshot({
          ...this.snapshot,
          sending: false,
          sendError: interactionError(error, '互动发送失败，请重试'),
        })
      })
      .finally(() => {
        if (this.sendController === controller) this.sendController = undefined
        if (this.sendInFlight === tracked) this.sendInFlight = undefined
      })
    this.sendInFlight = tracked
    return tracked
  }

  reset(): void {
    this.loadController?.abort()
    this.pageController?.abort()
    this.loadController = undefined
    this.loadInFlight = undefined
    this.loadTarget = undefined
    this.pageController = undefined
    this.pageInFlight = undefined
    this.sendController?.abort()
    this.sendController = undefined
    this.sendInFlight = undefined
    this.pendingMutationId = undefined
    this.setSnapshot(initialSnapshot())
  }

  private async runOpen(recordRef: string, controller: AbortController): Promise<void> {
    try {
      const capabilities = await this.client.capabilities(controller.signal)
      if (capabilities.features.worldInteractions !== true) {
        this.setSnapshot({ ...initialSnapshot(), status: 'unsupported', rootRef: recordRef })
        return
      }
      const page = await this.client.worldInteractions(recordRef, { limit: 50, offset: 0, signal: controller.signal })
      this.setSnapshot({
        status: page.items.length === 0 ? 'empty' : 'success',
        rootRef: recordRef,
        items: page.items,
        total: page.total,
        hasMore: page.hasMore,
        ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
        draft: '',
        sending: false,
        loadingMore: false,
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        this.setSnapshot({
          ...initialSnapshot(),
          status: 'error',
          rootRef: recordRef,
          error: interactionError(error, '互动暂时无法加载，请稍后重试'),
        })
      }
    }
  }

  private setSnapshot(snapshot: WorldInteractionSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}
