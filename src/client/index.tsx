import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { WorldDirectoryEntry } from './WorldDirectoryEntry.js'

export const inject = ['slots']

/** Register the World surface inside the Arkme dropdown through its additive directory slot. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('arkme.directory.entry', () => ctx.slots.register({
    name: 'arkme.directory.entry',
    id: 'arkme-world',
    order: 10,
    label: '世界',
  }, WorldDirectoryEntry))
}

export { WorldDirectoryEntry } from './WorldDirectoryEntry.js'
export { WorldFooterEntry } from './WorldFooterEntry.js'
export { WorldFeedStore } from './world-feed-store.js'
export { WorldInteractionStore } from './world-interaction-store.js'
