import { describe, expect, it, vi } from 'vitest'
import { createWorldProviderClient } from '../src/client/world-provider-client.js'

describe('World Provider client adapter', () => {
  it('uses additive Host operations through the generic SDK call boundary', async () => {
    const call = vi.fn(async (operation: string) => operation === 'world.feed'
      ? { items: [], total: 0, hasMore: false }
      : { mediaType: 'image/png', bytes: 8, dataBase64: 'iVBORw0KGgo=' })
    const client = createWorldProviderClient({ call } as never)

    await expect(client.worldFeed({ limit: 20, offset: 40 })).resolves.toEqual({
      items: [], total: 0, hasMore: false,
    })
    await expect(client.readWorldImage('opaque-image-ref')).resolves.toMatchObject({
      mediaType: 'image/png', bytes: 8,
    })
    expect(call).toHaveBeenNthCalledWith(1, 'world.feed', { limit: 20, offset: 40 }, undefined)
    expect(call).toHaveBeenNthCalledWith(2, 'world.image.read', { imageRef: 'opaque-image-ref' }, undefined)
  })
})
