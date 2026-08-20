import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('@senguoyun/dsh-arkme-world package contract', () => {
  it('ships as an independent DSH bundle and contributes through the Arkme directory slot', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      name: string
      files?: string[]
      repository?: { url?: string }
      dsh?: { bundle?: { patch?: string }; client?: { inject?: string[]; platform?: string } }
    }
    const source = readFileSync(resolve(root, 'src/client/index.tsx'), 'utf8')

    expect(manifest.name).toBe('@senguoyun/dsh-arkme-world')
    expect(manifest.repository?.url).toBe('git+https://github.com/LoveYou9t/arkme-dsh-world-plugin.git')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.files).toContain('cordis.patch.yml')
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: '@senguoyun/dsh-arkme-world'")
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(manifest.dsh?.client?.inject).toContain('@deepseek-ai/dsh-client-ui-sidebar')
    expect(source).toContain("ctx.slots.inject('arkme.directory.entry'")
    expect(source).toContain("id: 'arkme-world'")
    expect(source).not.toContain('sidebar.footer.action')
    expect(readFileSync(resolve(root, 'src/client/WorldDirectoryEntry.tsx'), 'utf8')).not.toContain('onActivateSurface')
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

    expect(manifest.peerDependencies?.['@senguoyun/dsh-arkme']).toBe('>=0.2.18')
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
