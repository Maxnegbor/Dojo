import type { ScheduleBlock, ScheduleBlockColor, ScheduleBlockState } from '@/types'
import {
  BLOCK_COLOR_DEFAULT_TITLES,
  BLOCK_COLOR_HEX,
  GREY_BLOCK_TITLE,
  SCHEDULE_BLOCK_COLORS,
} from '@/types'
import { localStore } from '@/lib/localStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { generateId } from '@/lib/utils'

export function isScheduleBlockColor(value: string): value is ScheduleBlockColor {
  return SCHEDULE_BLOCK_COLORS.includes(value as ScheduleBlockColor)
}

export function isGreyBlock(block: ScheduleBlock): boolean {
  return block.activity_type === 'grey'
}

const LEGACY_ACTIVITY_TO_COLOR: Record<string, ScheduleBlockColor> = {
  deep_work: 'blue',
  meeting: 'blue',
  break: 'rose',
  personal: 'rose',
  exercise: 'amber',
  other: 'blue',
}

export function normalizeScheduleBlock(block: ScheduleBlock): ScheduleBlock {
  if (block.activity_type === 'grey') {
    const trimmed = block.title.trim()
    return {
      ...block,
      color: BLOCK_COLOR_HEX.grey,
      title: trimmed.length > 0 ? block.title : GREY_BLOCK_TITLE,
    }
  }

  const blockColor = isScheduleBlockColor(block.activity_type)
    ? block.activity_type
    : LEGACY_ACTIVITY_TO_COLOR[block.activity_type] ?? 'blue'

  const defaultTitle = BLOCK_COLOR_DEFAULT_TITLES[blockColor]
  const title =
    block.title === GREY_BLOCK_TITLE || block.title === 'New Block' || !block.title.trim()
      ? defaultTitle
      : block.title

  return {
    ...block,
    activity_type: blockColor,
    color: BLOCK_COLOR_HEX[blockColor],
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
    color: BLOCK_COLOR_HEX.grey,
    title: GREY_BLOCK_TITLE,
    created_at: new Date().toISOString(),
  }
}

export function setScheduleBlockColor(
  block: ScheduleBlock,
  blockColor: ScheduleBlockColor,
): ScheduleBlock {
  const currentState: ScheduleBlockState = isScheduleBlockColor(block.activity_type)
    ? block.activity_type
    : block.activity_type === 'grey'
      ? 'grey'
      : 'blue'

  const priorDefault =
    currentState === 'grey'
      ? GREY_BLOCK_TITLE
      : BLOCK_COLOR_DEFAULT_TITLES[currentState]

  const nextTitle =
    block.title === priorDefault || block.title === 'New Block' || !block.title.trim()
      ? BLOCK_COLOR_DEFAULT_TITLES[blockColor]
      : block.title

  return {
    ...block,
    activity_type: blockColor,
    color: BLOCK_COLOR_HEX[blockColor],
    title: nextTitle,
  }
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
