/** Movement (px) before an unarmed touch gesture is treated as scroll. */
export const SLOT_SELECT_SLOP_PX = 12

/** Hold time before touch can begin a create-task slot selection. */
export const SLOT_SELECT_TOUCH_DELAY_MS = 280

export function movementExceedsSlop(
  startX: number,
  startY: number,
  x: number,
  y: number,
  slopPx = SLOT_SELECT_SLOP_PX,
): boolean {
  const dx = x - startX
  const dy = y - startY
  return dx * dx + dy * dy > slopPx * slopPx
}

/** Mouse/pen arm immediately; touch waits for delay so scroll can win. */
export function shouldArmSlotSelectImmediately(pointerType: string): boolean {
  return pointerType !== 'touch'
}

/**
 * Whether pointer-up should open the create-task modal.
 * Requires an armed, non-cancelled session.
 */
export function shouldCommitSlotSelect(session: {
  armed: boolean
  cancelled: boolean
}): boolean {
  return session.armed && !session.cancelled
}
