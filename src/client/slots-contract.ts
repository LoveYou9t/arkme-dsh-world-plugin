/**
 * Local compile-time contract for the Arkme-owned `arkme.directory.entry`
 * slot (declared at runtime by @senguoyun/dsh-arkme). Duplicate interface
 * merging with the provider's own declaration is additive and identical.
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Additive directory rows rendered inside the Arkme dropdown panel. */
    'arkme.directory.entry': {
      kind: 'list'
      scope: 'root'
      owner: ArkmeDirectoryEntryOwnerProps
    }
  }
}

/** Semantic content accepted by the Arkme-owned directory-row renderer. */
export interface ArkmeDirectoryRowProps {
  avatar: ReactNode
  title: string
  preview: string
  selected: boolean
  disabled?: boolean
  ariaLabel?: string
  onClick(): void
}

/** Owner share of a directory entry: column state plus owner-rendered chrome. */
export interface ArkmeDirectoryEntryOwnerProps {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
  /** Whether the Arkme account is authenticated. */
  authenticated: boolean
  /** Consumer entry currently selected by the Arkme directory owner. */
  activeEntryId?: string
  /** Select one consumer entry, or clear it before native navigation. */
  activateEntry(entryId?: string): void
  /** Render one row with Arkme-owned structure, tokens and accessibility. */
  renderRow(props: ArkmeDirectoryRowProps): ReactNode
}

/** Full props of a component registered into `arkme.directory.entry`. */
export type ArkmeDirectoryEntryComponentProps = PropsRuntime<'arkme.directory.entry'>
