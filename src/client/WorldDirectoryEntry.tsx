import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createArkmeSdk } from '@senguoyun/dsh-arkme/sdk'
import type { ArkmeDirectoryEntryComponentProps } from './slots-contract.js'
import { createWorldProviderClient } from './world-provider-client.js'
import { WorldFeedStore } from './world-feed-store.js'
import { WorldSurface } from './WorldSurface.js'
import { WorldStateView } from './WorldFooterEntry.js'

function previewText(status: WorldFeedStore['snapshot']['status'], count: number): string {
  switch (status) {
    case 'success': return count > 0 ? `${count} 条世界动态` : '世界动态'
    case 'loading': return '加载中…'
    case 'error': return '加载失败，点击重试'
    case 'unauthenticated': return '登录后查看'
    case 'unsupported': return 'Provider 需升级'
    default: return '世界动态'
  }
}

export const WORLD_DIRECTORY_ENTRY_ID = 'arkme-world'

/** One directory row inside the Arkme dropdown; clicking opens the World surface. */
export function WorldDirectoryEntry(props: ArkmeDirectoryEntryComponentProps) {
  const sdk = useMemo(() => createWorldProviderClient(createArkmeSdk()), [])
  const store = useMemo(() => new WorldFeedStore(sdk), [sdk])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const open = props.activeEntryId === WORLD_DIRECTORY_ENTRY_ID
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
      props.activateEntry(undefined)
    }
  }, [currentSession, open, props.activateEntry])
  useEffect(() => {
    if (!open) store.reset()
  }, [open, store])
  useEffect(() => () => { store.reset() }, [store])

  const toggle = () => {
    if (open) {
      props.activateEntry(undefined)
      return
    }
    openedFromSession.current = currentSession
    props.activateEntry(WORLD_DIRECTORY_ENTRY_ID)
  }

  return <>
    {props.renderRow({
      avatar: '世',
      title: '世界',
      preview: previewText(snapshot.status, snapshot.items.length),
      selected: open,
      ariaLabel: '世界',
      onClick: toggle,
    })}
    {open && <WorldSurface
      close={() => { props.activateEntry(undefined) }}
      refresh={() => { void store.refresh() }}
      refreshing={snapshot.refreshing}
      openedFromSession={openedFromSession.current}
      useSessions={props.useSessions}
    >
      <WorldStateView sdk={sdk} store={store} snapshot={snapshot} />
    </WorldSurface>}
  </>
}
