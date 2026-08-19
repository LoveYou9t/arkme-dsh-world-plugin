import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { WorldFooterEntry } from './WorldFooterEntry.js'

export const inject = ['slots']

/** Register the independent World surface through the official additive sidebar slot. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'arkme-world',
    order: 71,
    label: '世界',
  }, WorldFooterEntry))
}

export { WorldFooterEntry } from './WorldFooterEntry.js'
export { WorldFeedStore } from './world-feed-store.js'
