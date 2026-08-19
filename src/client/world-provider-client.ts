import type {
  ArkmeAuthSnapshot,
  ArkmeImagePayload,
  ArkmeProviderCapabilities,
  ArkmeProviderState,
  ArkmeSdk,
} from '@senguoyun/dsh-arkme/sdk'

export interface ArkmeWorldAvatarFallback {
  kind: 'phone_default'
  colorIndex: number
  label: string
}

export interface ArkmeWorldFeedItem {
  recordRef: string
  authorName: string
  avatarRef?: string
  avatarFallback?: ArkmeWorldAvatarFallback
  headline: string
  textContent: string
  tags: string[]
  templateKind: number
  createdAtMillis: number
  publishedAtMillis: number
  imageRefs: string[]
  imageCount: number
  videoCount: number
  voiceCount: number
  extendCount: number
}

export interface ArkmeWorldFeedPage {
  items: ArkmeWorldFeedItem[]
  total: number
  hasMore: boolean
  nextOffset?: number
}

export interface ArkmeWorldInteractionItem {
  interactionRef: string
  parentRef: string
  authorName: string
  avatarRef?: string
  avatarFallback?: ArkmeWorldAvatarFallback
  textContent: string
  createdAtMillis: number
  publishedAtMillis: number
  imageCount: number
  videoCount: number
  voiceCount: number
}

export interface ArkmeWorldInteractionPage {
  items: ArkmeWorldInteractionItem[]
  total: number
  hasMore: boolean
  nextOffset?: number
}

export interface ArkmeWorldInteractionCreateResult {
  interaction: ArkmeWorldInteractionItem
}

export type ArkmeWorldProviderCapabilities = Omit<ArkmeProviderCapabilities, 'features'> & {
  features: ArkmeProviderCapabilities['features'] & { worldFeed?: true; worldInteractions?: true }
}

export interface WorldProviderClient {
  capabilities(signal?: AbortSignal): Promise<ArkmeWorldProviderCapabilities>
  authStatus(signal?: AbortSignal): Promise<ArkmeAuthSnapshot>
  worldFeed(options?: { limit?: number; offset?: number; signal?: AbortSignal }): Promise<ArkmeWorldFeedPage>
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
  readWorldImage(imageRef: string, signal?: AbortSignal): Promise<ArkmeImagePayload>
  imageDataUrl(image: ArkmeImagePayload): string
  subscribe(
    listener: (state: ArkmeProviderState) => void,
    options?: { intervalMs?: number; immediate?: boolean; onError?: (error: unknown) => void },
  ): () => void
}

/**
 * The adapter deliberately uses ArkmeSdk.call so this package still installs beside an older
 * Provider and can show its upgrade state before the additive typed SDK helpers are available.
 */
export function createWorldProviderClient(sdk: ArkmeSdk): WorldProviderClient {
  return {
    capabilities: async signal => await sdk.capabilities(signal) as ArkmeWorldProviderCapabilities,
    authStatus: async signal => await sdk.authStatus(signal),
    worldFeed: async (options = {}) => await sdk.call<ArkmeWorldFeedPage>('world.feed' as never, {
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.offset === undefined ? {} : { offset: options.offset }),
    }, options.signal),
    worldInteractions: async (recordRef, options = {}) => {
      if (recordRef.trim() === '') throw new TypeError('Arkme World record reference must not be empty')
      return await sdk.call<ArkmeWorldInteractionPage>('world.interactions.list' as never, {
        recordRef,
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.offset === undefined ? {} : { offset: options.offset }),
      }, options.signal)
    },
    createWorldTextInteraction: async input => {
      if (input.targetRef.trim() === '' || input.textContent.trim() === '' || input.clientMutationId.trim() === '') {
        throw new TypeError('Arkme World interaction target, text, and mutation id must not be empty')
      }
      return await sdk.call<ArkmeWorldInteractionCreateResult>('world.interactions.create-text' as never, {
        targetRef: input.targetRef,
        textContent: input.textContent,
        clientMutationId: input.clientMutationId,
      }, input.signal)
    },
    readWorldImage: async (imageRef, signal) => {
      if (imageRef.trim() === '') throw new TypeError('Arkme World image reference must not be empty')
      return await sdk.call<ArkmeImagePayload>('world.image.read' as never, { imageRef }, signal)
    },
    imageDataUrl: image => sdk.imageDataUrl(image),
    subscribe: (listener, options) => sdk.subscribe(listener, options),
  }
}
