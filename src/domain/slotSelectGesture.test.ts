import { describe, expect, it } from 'vitest'
import {
  movementExceedsSlop,
  shouldArmSlotSelectImmediately,
  shouldCommitSlotSelect,
  SLOT_SELECT_SLOP_PX,
} from './slotSelectGesture'

describe('REQ-UI-016 — Touch scroll vs slot-select create', () => {
  it('detects movement beyond slop as scroll', () => {
    expect(movementExceedsSlop(0, 0, 0, 0)).toBe(false)
    expect(movementExceedsSlop(0, 0, SLOT_SELECT_SLOP_PX, 0)).toBe(false)
    expect(movementExceedsSlop(0, 0, SLOT_SELECT_SLOP_PX + 1, 0)).toBe(true)
    expect(movementExceedsSlop(10, 10, 10, 10 + SLOT_SELECT_SLOP_PX + 1)).toBe(
      true,
    )
  })

  it('arms immediately for mouse/pen, not for touch', () => {
    expect(shouldArmSlotSelectImmediately('mouse')).toBe(true)
    expect(shouldArmSlotSelectImmediately('pen')).toBe(true)
    expect(shouldArmSlotSelectImmediately('touch')).toBe(false)
  })

  it('only commits when armed and not cancelled', () => {
    expect(shouldCommitSlotSelect({ armed: true, cancelled: false })).toBe(true)
    expect(shouldCommitSlotSelect({ armed: false, cancelled: false })).toBe(
      false,
    )
    expect(shouldCommitSlotSelect({ armed: true, cancelled: true })).toBe(false)
    expect(shouldCommitSlotSelect({ armed: false, cancelled: true })).toBe(
      false,
    )
  })
})
