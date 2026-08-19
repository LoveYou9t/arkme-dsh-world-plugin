import { describe, expect, it, vi } from 'vitest'
import { WorldFeedStore, type WorldFeedClient } from '../src/client/world-feed-store.js'
import type { ArkmeWorldFeedPage } from '../src/client/world-provider-client.js'

function page(items: ArkmeWorldFeedPage['items'], patch: Partial<ArkmeWorldFeedPage> = {}): ArkmeWorldFeedPage {
  return { items, total: items.length, hasMore: false, ...patch }
}

const firstItem = {
  recordRef: 'record-ref-1', authorName: '小林', headline: '', textContent: '第一条', tags: [],
  templateKind: 1, createdAtMillis: 1, publishedAtMillis: 2, imageRefs: [], imageCount: 0,
  videoCount: 0, voiceCount: 0, extendCount: 0,
}

function client(overrides: Partial<WorldFeedClient> = {}): WorldFeedClient {
  return {
    capabilities: vi.fn(async () => ({ features: { worldFeed: true } } as never)),
    authStatus: vi.fn(async () => ({ status: 'authenticated', environment: 'test', userId: 1 })),
    worldFeed: vi.fn(async () => page([firstItem])),
    ...overrides,
  }
}

describe('WorldFeedStore', () => {
  it('distinguishes unsupported, unauthenticated, empty, and success states', async () => {
    const unsupported = new WorldFeedStore(client({
      capabilities: vi.fn(async () => ({ features: {} } as never)),
    }))
    await unsupported.load()
    expect(unsupported.getSnapshot().status).toBe('unsupported')

    const unauthenticated = new WorldFeedStore(client({
      authStatus: vi.fn(async () => ({ status: 'logged-out', environment: 'test' })),
    }))
    await unauthenticated.load()
    expect(unauthenticated.getSnapshot().status).toBe('unauthenticated')

    const empty = new WorldFeedStore(client({ worldFeed: vi.fn(async () => page([])) }))
    await empty.load()
    expect(empty.getSnapshot().status).toBe('empty')

    const success = new WorldFeedStore(client())
    await success.load()
    expect(success.getSnapshot()).toMatchObject({ status: 'success', items: [firstItem] })
  })

  it('keeps one refresh in flight and replaces the list when it succeeds', async () => {
    let resolveRefresh: ((value: ArkmeWorldFeedPage) => void) | undefined
    const refresh = new Promise<ArkmeWorldFeedPage>(resolve => { resolveRefresh = resolve })
    const worldFeed = vi.fn()
      .mockResolvedValueOnce(page([firstItem]))
      .mockReturnValueOnce(refresh)
    const store = new WorldFeedStore(client({ worldFeed }))
    await store.load()

    const first = store.refresh()
    const second = store.refresh()
    expect(first).toBe(second)
    expect(store.getSnapshot()).toMatchObject({ status: 'success', refreshing: true, items: [firstItem] })

    resolveRefresh?.(page([{ ...firstItem, recordRef: 'record-ref-2', textContent: '刷新后' }]))
    await first
    expect(store.getSnapshot()).toMatchObject({
      status: 'success', refreshing: false, items: [{ recordRef: 'record-ref-2' }],
    })
    expect(worldFeed).toHaveBeenCalledTimes(2)
  })

  it('single-flights pagination, dedupes records, and keeps old content on a retryable failure', async () => {
    const worldFeed = vi.fn()
      .mockResolvedValueOnce(page([firstItem], { total: 3, hasMore: true, nextOffset: 1 }))
      .mockResolvedValueOnce(page([
        firstItem,
        { ...firstItem, recordRef: 'record-ref-2', textContent: '第二条' },
      ], { total: 3, hasMore: true, nextOffset: 3 }))
      .mockRejectedValueOnce(new Error('网络中断'))
    const store = new WorldFeedStore(client({ worldFeed }))
    await store.load()

    await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({
      status: 'success', items: [{ recordRef: 'record-ref-1' }, { recordRef: 'record-ref-2' }],
    })

    await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({
      status: 'success', items: [{ recordRef: 'record-ref-1' }, { recordRef: 'record-ref-2' }],
      incrementalError: '网络中断',
    })
  })

  it('returns the same in-flight pagination promise for repeated scroll triggers', async () => {
    let resolvePage: ((value: ArkmeWorldFeedPage) => void) | undefined
    const deferred = new Promise<ArkmeWorldFeedPage>(resolve => { resolvePage = resolve })
    const worldFeed = vi.fn()
      .mockResolvedValueOnce(page([firstItem], { total: 2, hasMore: true, nextOffset: 1 }))
      .mockReturnValueOnce(deferred)
    const store = new WorldFeedStore(client({ worldFeed }))
    await store.load()

    const first = store.loadMore()
    const second = store.loadMore()
    expect(first).toBe(second)
    expect(worldFeed).toHaveBeenCalledTimes(2)

    resolvePage?.(page([{ ...firstItem, recordRef: 'record-ref-2' }]))
    await first
    expect(store.getSnapshot().items).toHaveLength(2)
  })

  it('clears old account data before reloading after an identity change', async () => {
    const store = new WorldFeedStore(client())
    await store.load()
    expect(store.getSnapshot().items).toHaveLength(1)

    store.reconcileProviderState({
      contractVersion: 1, environment: 'test', authStatus: 'authenticated', userId: 2, revision: 0,
    })
    expect(store.getSnapshot()).toMatchObject({ status: 'idle', items: [] })
  })
})
