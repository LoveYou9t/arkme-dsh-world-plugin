import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('@senguoyun/dsh-arkme-world package contract', () => {
  it('ships as an independent DSH client plugin and uses only the official sidebar slot', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      name: string
      dsh?: { client?: { inject?: string[]; platform?: string } }
    }
    const source = readFileSync(resolve(root, 'src/client/index.tsx'), 'utf8')

    expect(manifest.name).toBe('@senguoyun/dsh-arkme-world')
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(manifest.dsh?.client?.inject).toContain('@deepseek-ai/dsh-client-ui-sidebar')
    expect(source).toContain("ctx.slots.inject('sidebar.footer.action'")
    expect(source).toContain("id: 'arkme-world'")
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('world.jotmo')
  })

  it('builds independently from the Arkme provider repository', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      peerDependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const tsconfig = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8')) as {
      extends?: string
    }

    expect(manifest.peerDependencies?.['@senguoyun/dsh-arkme']).toBe('>=0.1.4')
    expect(manifest.devDependencies?.['@senguoyun/dsh-arkme']).toBe('0.1.4')
    expect(JSON.stringify(manifest)).not.toContain('workspace:')
    expect(tsconfig.extends).toBeUndefined()
  })

  it('keeps failed avatar placeholders fixed-size instead of inheriting feed image geometry', () => {
    const styles = readFileSync(resolve(root, 'src/client/world.module.css'), 'utf8')
    const source = readFileSync(resolve(root, 'src/client/WorldFooterEntry.tsx'), 'utf8')

    expect(styles).toContain('.avatar.imagePlaceholder')
    expect(styles).not.toMatch(/\.worldImage\s*,\s*\.imagePlaceholder/)
    expect(source).toContain('图片加载失败，点击重试')
  })
})
