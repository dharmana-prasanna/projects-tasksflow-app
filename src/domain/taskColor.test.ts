import { describe, expect, it } from 'vitest'
import { normalizeTaskColor, resolveTaskColor } from './taskColor'

describe('REQ-MODEL-003 — Task color override', () => {
  it('normalizeTaskColor accepts #RRGGBB only', () => {
    expect(normalizeTaskColor('#1f6b5a')).toBe('#1f6b5a')
    expect(normalizeTaskColor('  #AABBCC  ')).toBe('#AABBCC')
    expect(normalizeTaskColor('')).toBeUndefined()
    expect(normalizeTaskColor('red')).toBeUndefined()
    expect(normalizeTaskColor('#fff')).toBeUndefined()
  })

  it('resolveTaskColor prefers override then project', () => {
    const projectColor = (id: string) =>
      id === 'p1' ? '#1d4e89' : '#000000'
    expect(
      resolveTaskColor({ projectId: 'p1', color: '#8a2f45' }, projectColor),
    ).toBe('#8a2f45')
    expect(resolveTaskColor({ projectId: 'p1' }, projectColor)).toBe('#1d4e89')
    expect(
      resolveTaskColor({ projectId: 'p1', color: '' }, projectColor),
    ).toBe('#1d4e89')
  })
})
