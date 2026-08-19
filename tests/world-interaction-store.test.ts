import { describe, expect, it, vi } from 'vitest'
import { WorldInteractionStore, type WorldInteractionClient } from '../src/client/world-interaction-store.js'

const first = {
  interactionRef: 'comment-ref-1', parentRef: 'record-ref', authorName: '阿七', textContent: '第一条评论',
  createdAtMillis: 1, publishedAtMillis: 2, imageCount: 0, videoCount: 0, voiceCount: 0,
}

function client(overrides: Partial<WorldInteractionClient> = {}): WorldInteractionClient {
  return {
    capabilities: vi.fn(async () => ({ features: { worldFeed: true, worldInteractions: true } } as never)),
    worldInteractions: vi.fn(async () => ({ items: [first], total: 1, hasMore: false })),
    createWorldTextInteraction: vi.fn(async input => ({
      interaction: {
        ...first,
        interactionRef: 'created-ref',
        parentRef: input.targetRef,
        authorName: '我',
        textContent: input.textContent,
      },
    })),
    ...overrides,
  }
}

describe('WorldInteractionStore', () => {
  it('distinguishes unsupported, empty, error, and success states', async () => {
    const unsupported = new WorldInteractionStore(client({
      capabilities: vi.fn(async () => ({ features: { worldFeed: true } } as never)),
    }))
    await unsupported.open('record-ref')
    expect(unsupported.getSnapshot().status).toBe('unsupported')

    const empty = new WorldInteractionStore(client({
      worldInteractions: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
    }))
    await empty.open('record-ref')
    expect(empty.getSnapshot().status).toBe('empty')

    const error = new WorldInteractionStore(client({
      worldInteractions: vi.fn(async () => { throw new Error('网络中断') }),
    }))
    await error.open('record-ref')
    expect(error.getSnapshot()).toMatchObject({ status: 'error', error: '网络中断' })

    const success = new WorldInteractionStore(client())
    await success.open('record-ref')
    expect(success.getSnapshot()).toMatchObject({ status: 'success', items: [first] })
  })

  it('single-flights opening the same record', async () => {
    let resolvePage: ((value: { items: typeof first[]; total: number; hasMore: false }) => void) | undefined
    const deferred = new Promise<{ items: typeof first[]; total: number; hasMore: false }>(resolve => { resolvePage = resolve })
    const worldInteractions = vi.fn(() => deferred)
    const store = new WorldInteractionStore(client({ worldInteractions }))

    const one = store.open('record-ref')
    const two = store.open('record-ref')
    expect(one).toBe(two)
    resolvePage?.({ items: [first], total: 1, hasMore: false })
    await one
    expect(worldInteractions).toHaveBeenCalledTimes(1)
  })

  it('reuses the mutation id after a failure and appends a successful reply once', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('发送失败'))
      .mockImplementationOnce(async input => ({
        interaction: {
          ...first,
          interactionRef: 'created-ref',
          parentRef: input.targetRef,
          authorName: '我',
          textContent: input.textContent,
        },
      }))
    const store = new WorldInteractionStore(client({ createWorldTextInteraction: create }))
    await store.open('record-ref')
    store.setReplyTarget({ interactionRef: first.interactionRef, authorName: first.authorName })
    store.setDraft('  回复你  ')

    await store.submit()
    expect(store.getSnapshot()).toMatchObject({ sending: false, draft: '  回复你  ', sendError: '发送失败' })
    await store.submit()

    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]![0].clientMutationId).toBe(create.mock.calls[0]![0].clientMutationId)
    expect(create.mock.calls[0]![0]).toMatchObject({ targetRef: 'comment-ref-1', textContent: '回复你' })
    expect(store.getSnapshot()).toMatchObject({
      status: 'success', sending: false, draft: '',
      items: [first, { interactionRef: 'created-ref', parentRef: 'comment-ref-1' }],
    })
    expect(store.getSnapshot().replyTarget).toBeUndefined()
  })

  it('prevents duplicate sends while one request is in flight', async () => {
    let resolveCreate: ((value: { interaction: typeof first }) => void) | undefined
    const deferred = new Promise<{ interaction: typeof first }>(resolve => { resolveCreate = resolve })
    const create = vi.fn(() => deferred)
    const store = new WorldInteractionStore(client({ createWorldTextInteraction: create }))
    await store.open('record-ref')
    store.setDraft('评论')

    const one = store.submit()
    const two = store.submit()
    expect(one).toBe(two)
    expect(store.getSnapshot().sending).toBe(true)
    resolveCreate?.({ interaction: { ...first, interactionRef: 'created-ref', textContent: '评论' } })
    await one
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('single-flights pagination, dedupes interactions, and preserves old rows on failure', async () => {
    const second = { ...first, interactionRef: 'comment-ref-2', textContent: '第二条评论' }
    const worldInteractions = vi.fn()
      .mockResolvedValueOnce({ items: [first], total: 3, hasMore: true, nextOffset: 1 })
      .mockResolvedValueOnce({ items: [first, second], total: 3, hasMore: true, nextOffset: 2 })
      .mockRejectedValueOnce(new Error('分页失败'))
    const store = new WorldInteractionStore(client({ worldInteractions }))
    await store.open('record-ref')

    await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({
      items: [first, second], loadingMore: false, hasMore: true, nextOffset: 2,
    })
    await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({
      items: [first, second], loadingMore: false, incrementalError: '分页失败',
    })
  })
})
