import type { ScheduleBlock } from '@/types'
import { GREY_BLOCK_HEX, GREY_BLOCK_TITLE } from '@/types'
import {
  getScheduleColorPreset,
  getWorkoutSchedulePreset,
  isWorkoutScheduleColor,
  scheduleColorDefaultTitle,
  scheduleColorHex,
} from '@/lib/scheduleColors'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { generateId } from '@/lib/utils'

export function isGreyBlock(block: ScheduleBlock): boolean {
  return block.activity_type === 'grey'
}

const LEGACY_ACTIVITY_TO_COLOR: Record<string, string> = {
  deep_work: 'blue',
  meeting: 'blue',
  break: 'rose',
  personal: 'rose',
  exercise: 'amber',
  other: 'blue',
}

function resolveActivityType(activityType: string): string {
  if (activityType === 'grey') return 'grey'
  if (getScheduleColorPreset(activityType)) return activityType
  return LEGACY_ACTIVITY_TO_COLOR[activityType] ?? activityType
}

export function normalizeScheduleBlock(block: ScheduleBlock): ScheduleBlock {
  const notes = typeof block.notes === 'string' ? block.notes : ''
  if (block.activity_type === 'grey') {
    const trimmed = block.title.trim()
    return {
      ...block,
      notes,
      color: GREY_BLOCK_HEX,
      title: trimmed.length > 0 ? block.title : GREY_BLOCK_TITLE,
    }
  }

  const activityType = resolveActivityType(block.activity_type)
  const defaultTitle = scheduleColorDefaultTitle(activityType)
  const title =
    block.title === GREY_BLOCK_TITLE || block.title === 'New Block' || !block.title.trim()
      ? defaultTitle
      : block.title

  return {
    ...block,
    notes,
    activity_type: activityType,
    color: scheduleColorHex(activityType, block.color),
    title,
  }
}

export function createScheduleBlock(params: {
  id: string
  user_id: string
  date: string
  start_time: string
  end_time: string
}): ScheduleBlock {
  return {
    id: params.id,
    user_id: params.user_id,
    date: params.date,
    start_time: params.start_time,
    end_time: params.end_time,
    activity_type: 'grey',
    color: GREY_BLOCK_HEX,
    title: GREY_BLOCK_TITLE,
    notes: '',
    created_at: new Date().toISOString(),
  }
}

export function setScheduleBlockColor(block: ScheduleBlock, colorId: string): ScheduleBlock {
  if (colorId === 'grey') {
    return normalizeScheduleBlock({
      ...block,
      activity_type: 'grey',
      color: GREY_BLOCK_HEX,
      title:
        block.title.trim() && block.title !== GREY_BLOCK_TITLE
          ? block.title
          : GREY_BLOCK_TITLE,
    })
  }

  const currentType = resolveActivityType(block.activity_type)
  const priorDefault =
    currentType === 'grey' ? GREY_BLOCK_TITLE : scheduleColorDefaultTitle(currentType)
  const nextDefault = scheduleColorDefaultTitle(colorId)

  const nextTitle =
    block.title === priorDefault || block.title === 'New Block' || !block.title.trim()
      ? nextDefault
      : block.title

  return normalizeScheduleBlock({
    ...block,
    activity_type: colorId,
    color: scheduleColorHex(colorId, block.color),
    title: nextTitle,
  })
}

export function applyWorkoutScheduleColor(block: ScheduleBlock, title: string): ScheduleBlock {
  const workout = getWorkoutSchedulePreset()
  return normalizeScheduleBlock({
    ...block,
    activity_type: workout.id,
    color: workout.hex,
    title,
  })
}

export function blockUsesWorkoutColor(block: ScheduleBlock): boolean {
  return isWorkoutScheduleColor(block.activity_type)
}

export async function fetchScheduleBlocksForDate(
  userId: string,
  date: string,
): Promise<ScheduleBlock[]> {
  if (isSupabaseConfigured) {
    const { fetchScheduleBlocks } = await import('@/lib/supabase')
    return (await fetchScheduleBlocks(userId, date)).map(normalizeScheduleBlock)
  }
  return localStore.getScheduleBlocks(date).map(normalizeScheduleBlock)
}

export function cloneScheduleBlocksForDate(
  blocks: ScheduleBlock[],
  targetDate: string,
  userId: string,
): ScheduleBlock[] {
  const now = new Date().toISOString()
  return blocks.map((block) => ({
    ...block,
    id: generateId(),
    user_id: userId,
    date: targetDate,
    created_at: now,
  }))
}

/** Wipe `existing` on the target date, then persist `nextBlocks` (already dated).
 * When `preservePlanLinkedForDate` is set, blocks linked to that day's exercise plan
 * stay put (template / paste overlays around them).
 */
export async function replaceScheduleBlocksForDate(
  existing: ScheduleBlock[],
  nextBlocks: ScheduleBlock[],
  options?: { preservePlanLinkedForDate?: string },
): Promise<ScheduleBlock[]> {
  const preserveIds = new Set<string>()
  if (options?.preservePlanLinkedForDate) {
    const { getPlannedWorkoutsForDate } = await import('@/lib/exercisePlan')
    for (const plan of getPlannedWorkoutsForDate(options.preservePlanLinkedForDate)) {
      if (plan.schedule_block_id) preserveIds.add(plan.schedule_block_id)
    }
  }

  const preserved = existing.filter((block) => preserveIds.has(block.id))
  for (const block of existing) {
    if (preserveIds.has(block.id)) continue
    await removeScheduleBlock(block.id)
  }

  const saved: ScheduleBlock[] = [...preserved]
  for (const block of nextBlocks) {
    saved.push(await persistScheduleBlock(block))
  }
  return saved.sort((a, b) => a.start_time.localeCompare(b.start_time))
}

function isDefaultBlockTitle(title: string) {
  const trimmed = title.trim()
  return trimmed.length === 0 || trimmed === GREY_BLOCK_TITLE || trimmed === 'New Block'
}

/**
 * A move or resize often resends the block it captured before the rename.
 * That copy still says "New Block". An emptied title is a real clear, so only
 * the untouched default label is ignored.
 */
function mergeBlockWrite(previous: ScheduleBlock | undefined, incoming: ScheduleBlock): ScheduleBlock {
  const next = normalizeScheduleBlock(incoming)
  const staleDefault = incoming.title === GREY_BLOCK_TITLE || incoming.title === 'New Block'
  if (!previous || !staleDefault || isDefaultBlockTitle(previous.title)) return next
  return { ...next, title: previous.title }
}

function sameScheduleWrite(a: ScheduleBlock, b: ScheduleBlock) {
  return (
    a.title === b.title &&
    a.notes === b.notes &&
    a.date === b.date &&
    a.start_time === b.start_time &&
    a.end_time === b.end_time &&
    a.activity_type === b.activity_type &&
    a.color === b.color
  )
}

const desiredScheduleBlocks = new Map<string, ScheduleBlock>()
const scheduleWriteInflight = new Map<string, Promise<ScheduleBlock>>()

async function writeScheduleBlock(block: ScheduleBlock): Promise<ScheduleBlock> {
  const normalized = normalizeScheduleBlock(block)
  if (isSupabaseConfigured) {
    const { upsertScheduleBlock } = await import('@/lib/supabase')
    return normalizeScheduleBlock(await upsertScheduleBlock(normalized))
  }
  localStore.upsertScheduleBlock(normalized)
  return normalized
}

async function flushScheduleBlock(id: string): Promise<ScheduleBlock> {
  let written: ScheduleBlock | null = null
  while (true) {
    const snapshot = desiredScheduleBlocks.get(id)
    if (!snapshot) {
      if (!written) throw new Error('Missing schedule block')
      return written
    }
    written = await writeScheduleBlock(snapshot)
    const latest = desiredScheduleBlocks.get(id)
    if (latest && sameScheduleWrite(latest, snapshot)) {
      desiredScheduleBlocks.set(id, written)
      return written
    }
  }
}

export function persistScheduleBlock(block: ScheduleBlock): Promise<ScheduleBlock> {
  const id = block.id
  desiredScheduleBlocks.set(id, mergeBlockWrite(desiredScheduleBlocks.get(id), block))

  const existing = scheduleWriteInflight.get(id)
  if (existing) {
    return existing.then(() => persistScheduleBlock(desiredScheduleBlocks.get(id) ?? block))
  }

  const job = flushScheduleBlock(id)
  scheduleWriteInflight.set(id, job)
  return job.finally(() => {
    if (scheduleWriteInflight.get(id) === job) scheduleWriteInflight.delete(id)
  })
}

export async function removeScheduleBlock(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { deleteScheduleBlock } = await import('@/lib/supabase')
    await deleteScheduleBlock(id)
    return
  }
  localStore.deleteScheduleBlock(id)
}
