import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  calculateWorldPreviewIndex,
  WorldFooterEntry,
  WorldImagePreview,
  WorldInteractionPanel,
  WorldStateView,
} from '../src/client/WorldFooterEntry.js'
import { calculateWorldFrame, WORLD_BRAND_LABEL } from '../src/client/WorldSurface.js'
import type { WorldFeedSnapshot } from '../src/client/world-feed-store.js'
import type { WorldInteractionSnapshot } from '../src/client/world-interaction-store.js'

const sdk = {
  readWorldImage: vi.fn(),
  imageDataUrl: vi.fn(),
} as never
const store = {
  load: vi.fn(),
  refresh: vi.fn(),
  loadMore: vi.fn(),
} as never

function renderState(snapshot: WorldFeedSnapshot): string {
  return renderToStaticMarkup(<WorldStateView sdk={sdk} store={store} snapshot={snapshot} />)
}

const base: WorldFeedSnapshot = {
  status: 'idle', items: [], total: 0, hasMore: false, refreshing: false, loadingMore: false,
}

describe('World desktop UI', () => {
  it('uses the Arkme brand in the World surface header', () => {
    expect(WORLD_BRAND_LABEL).toBe('ARKME WORLD')
  })

  it('keeps a consistent inset over the native conversation surface', () => {
    expect(calculateWorldFrame({ left: 280, top: 0, width: 1232, height: 674 })).toEqual({
      left: 294, top: 14, width: 1204, height: 646,
    })
  })

  it('renders explicit unsupported, unauthenticated, error, and empty feedback', () => {
    expect(renderState({ ...base, status: 'unsupported' })).toContain('升级 Arkme 插件后查看世界')
    expect(renderState({ ...base, status: 'unauthenticated' })).toContain('先从左侧 Arkme 入口完成登录')
    expect(renderState({ ...base, status: 'error', error: '网络中断' })).toContain('网络中断')
    expect(renderState({ ...base, status: 'empty' })).toContain('这里暂时还没有内容')
  })

  it('renders World cards and honest media placeholders without adding unsupported actions', () => {
    const html = renderState({
      ...base,
      status: 'success',
      items: [{
        recordRef: 'record-ref', authorName: '小林', headline: '傍晚散步', textContent: '今天的风很舒服',
        tags: ['生活'], templateKind: 8, createdAtMillis: 1, publishedAtMillis: 2,
        imageRefs: [], imageCount: 2, videoCount: 1, voiceCount: 1, extendCount: 3,
      }],
    })

    expect(html).toContain('小林')
    expect(html).toContain('傍晚散步')
    expect(html).toContain('2 张图片 · 1 个视频 · 1 条语音')
    expect(html).toContain('3 条互动')
    expect(html).toContain('查看 3 条互动')
    expect(html).not.toContain('发布')
    expect(html).not.toContain('举报')
    expect(html).not.toContain('分享')
  })

  it('renders a reply-aware interaction detail with sending and failure feedback', () => {
    const item = {
      recordRef: 'record-ref', authorName: '小林', headline: '', textContent: '今天的风很舒服', tags: [],
      templateKind: 1, createdAtMillis: 1, publishedAtMillis: 2, imageRefs: [], imageCount: 0,
      videoCount: 0, voiceCount: 0, extendCount: 1,
    }
    const snapshot: WorldInteractionSnapshot = {
      status: 'success', rootRef: 'record-ref', items: [{
        interactionRef: 'comment-ref', parentRef: 'record-ref', authorName: '阿七', textContent: '第一条评论',
        createdAtMillis: 3, publishedAtMillis: 4, imageCount: 0, videoCount: 0, voiceCount: 0,
      }], total: 1, hasMore: false, sending: false, loadingMore: false, draft: '回复内容',
      replyTarget: { interactionRef: 'comment-ref', authorName: '阿七' }, sendError: '发送失败',
    }
    const interactionStore = {
      setDraft: vi.fn(), setReplyTarget: vi.fn(), clearReplyTarget: vi.fn(), submit: vi.fn(), open: vi.fn(),
    } as never
    const html = renderToStaticMarkup(<WorldInteractionPanel
      sdk={sdk}
      item={item}
      store={interactionStore}
      snapshot={snapshot}
      onClose={vi.fn()}
    />)

    expect(html).toContain('今天的风很舒服')
    expect(html).toContain('第一条评论')
    expect(html).toContain('回复 阿七')
    expect(html).toContain('发送失败')
    expect(html).toContain('>重新发送</button>')
  })

  it('renders the same color-index and label semantics for phone-default avatars', () => {
    const html = renderState({
      ...base,
      status: 'success',
      items: [{
        recordRef: 'record-phone-avatar', authorName: 'Jotmoer',
        avatarFallback: { kind: 'phone_default', colorIndex: 3, label: '61' },
        headline: '', textContent: '默认头像', tags: [], templateKind: 1,
        createdAtMillis: 1, publishedAtMillis: 2, imageRefs: [], imageCount: 0,
        videoCount: 0, voiceCount: 0, extendCount: 0,
      }],
    })

    expect(html).toContain('>61</span>')
    expect(html).toContain('background-color:#eb5757')
  })

  it('renders an accessible image preview with bounded navigation controls', () => {
    expect(calculateWorldPreviewIndex(0, 3, -1)).toBe(0)
    expect(calculateWorldPreviewIndex(0, 3, 1)).toBe(1)
    expect(calculateWorldPreviewIndex(2, 3, 1)).toBe(2)

    const html = renderToStaticMarkup(<WorldImagePreview
      sdk={sdk}
      imageRefs={['image-1', 'image-2', 'image-3']}
      authorName="小林"
      activeIndex={1}
      onClose={vi.fn()}
      onMove={vi.fn()}
    />)

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="图片预览"')
    expect(html).toContain('小林 · 2 / 3')
    expect(html).toContain('>上一张</button>')
    expect(html).toContain('>下一张</button>')
    expect(html).toContain('>关闭</button>')
  })

  it('renders the official footer contribution in wide and rail modes', () => {
    const useSessions = ((selector: (state: { current: string }) => unknown) => selector({ current: 'session-1' })) as never
    const wide = renderToStaticMarkup(<WorldFooterEntry wide useSessions={useSessions} />)
    const rail = renderToStaticMarkup(<WorldFooterEntry wide={false} useSessions={useSessions} />)

    expect(wide).toContain('>世界</span>')
    expect(wide).toContain('aria-expanded="false"')
    expect(rail).toContain('title="世界"')
  })
})
