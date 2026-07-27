import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

describe('REQ-UI-004 — Task modal Delete placement', () => {
  const modalSrc = readFileSync(
    resolve(here, 'components/TaskModal.tsx'),
    'utf8',
  )
  const css = readFileSync(resolve(here, 'App.css'), 'utf8')

  it('puts Delete in the sticky header, not the footer actions', () => {
    expect(modalSrc).toMatch(/modal__header-actions/)
    expect(modalSrc).toMatch(/btn--header-delete/)
    // Footer should only host Cancel / Save
    const actionsBlock =
      modalSrc.match(/className="modal__actions"[\s\S]*?<\/div>\s*<\/form>/)?.[0] ??
      ''
    expect(actionsBlock).toMatch(/Cancel/)
    expect(actionsBlock).toMatch(/Save/)
    expect(actionsBlock).not.toMatch(/Delete/)
  })

  it('keeps the modal header sticky while the form scrolls', () => {
    expect(css).toMatch(/\.modal__header\s*\{[^}]*position:\s*sticky/s)
    expect(css).toMatch(/\.modal__header\s*\{[^}]*top:\s*0/s)
  })
})
