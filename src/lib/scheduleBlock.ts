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
  if (block.activity_type === 'grey') {
    const trimmed = block.title.trim()
    return {
      ...block,
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

/** Wipe `existing` on the target date, then persist `nextBlocks` (already dated). */
export async function replaceScheduleBlocksForDate(
  existing: ScheduleBlock[],
  nextBlocks: ScheduleBlock[],
): Promise<ScheduleBlock[]> {
  for (const block of existing) {
    await removeScheduleBlock(block.id)
  }
  const saved: ScheduleBlock[] = []
  for (const block of nextBlocks) {
    saved.push(await persistScheduleBlock(block))
  }
  return saved
}

export async function persistScheduleBlock(block: ScheduleBlock): Promise<ScheduleBlock> {
  const normalized = normalizeScheduleBlock(block)
  if (isSupabaseConfigured) {
    const { upsertScheduleBlock } = await import('@/lib/supabase')
    return normalizeScheduleBlock(await upsertScheduleBlock(normalized))
  }
  localStore.upsertScheduleBlock(normalized)
  return normalized
}

export async function removeScheduleBlock(id: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { deleteScheduleBlock } = await import('@/lib/supabase')
    await deleteScheduleBlock(id)
    return
  }
  localStore.deleteScheduleBlock(id)
}
