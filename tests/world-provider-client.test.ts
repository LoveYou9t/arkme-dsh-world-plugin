import { describe, expect, it, vi } from 'vitest'
import { createWorldProviderClient } from '../src/client/world-provider-client.js'

describe('World Provider client adapter', () => {
  it('uses additive Host operations through the generic SDK call boundary', async () => {
    const call = vi.fn(async (operation: string) => {
      if (operation === 'world.feed' || operation === 'world.interactions.list') {
        return { items: [], total: 0, hasMore: false }
      }
      if (operation === 'world.interactions.create-text') {
        return { interaction: { interactionRef: 'interaction-ref', parentRef: 'record-ref' } }
      }
      return { mediaType: 'image/png', bytes: 8, dataBase64: 'iVBORw0KGgo=' }
    })
    const client = createWorldProviderClient({ call } as never)

    await expect(client.worldFeed({ limit: 20, offset: 40 })).resolves.toEqual({
      items: [], total: 0, hasMore: false,
    })
    await expect(client.readWorldImage('opaque-image-ref')).resolves.toMatchObject({
      mediaType: 'image/png', bytes: 8,
    })
    await expect(client.worldInteractions('record-ref', { limit: 50, offset: 10 })).resolves.toEqual({
      items: [], total: 0, hasMore: false,
    })
    await expect(client.createWorldTextInteraction({
      targetRef: 'record-ref', textContent: '你好', clientMutationId: 'mutation-20260819-0001',
    })).resolves.toMatchObject({ interaction: { interactionRef: 'interaction-ref' } })
    expect(call).toHaveBeenNthCalledWith(1, 'world.feed', { limit: 20, offset: 40 }, undefined)
    expect(call).toHaveBeenNthCalledWith(2, 'world.image.read', { imageRef: 'opaque-image-ref' }, undefined)
    expect(call).toHaveBeenNthCalledWith(3, 'world.interactions.list', {
      recordRef: 'record-ref', limit: 50, offset: 10,
    }, undefined)
    expect(call).toHaveBeenNthCalledWith(4, 'world.interactions.create-text', {
      targetRef: 'record-ref', textContent: '你好', clientMutationId: 'mutation-20260819-0001',
    }, undefined)
  })
})
