import type { ScheduleBlock } from '@/types'
import { GREY_BLOCK_HEX, GREY_BLOCK_TITLE } from '@/types'
import { scheduleColorDefaultTitle, scheduleColorHex } from '@/lib/scheduleColors'
import { normalizeScheduleBlock } from '@/lib/scheduleBlock'
import { storageGetItem, storageSetItem } from '@/lib/userStorage'
import { generateId } from '@/lib/utils'

const STORAGE_KEY = 'personal-os-schedule-templates'
export const SCHEDULE_TEMPLATES_CHANGED = 'personal-os-schedule-templates-changed'

export interface ScheduleTemplateBlock {
  start_time: string
  end_time: string
  title: string
  /** Color preset id, or `grey`. */
  activity_type: string
}

export interface ScheduleTemplate {
  id: string
  name: string
  blocks: ScheduleTemplateBlock[]
  created_at: string
  updated_at: string
}

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value.trim())
}

function normalizeTemplateBlock(raw: Partial<ScheduleTemplateBlock>): ScheduleTemplateBlock | null {
  if (!isValidTime(raw.start_time) || !isValidTime(raw.end_time)) return null
  const start = raw.start_time.trim()
  const end = raw.end_time.trim()
  const activityType =
    typeof raw.activity_type === 'string' && raw.activity_type.trim()
      ? raw.activity_type.trim()
      : 'grey'
  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim().slice(0, 80)
      : activityType === 'grey'
        ? GREY_BLOCK_TITLE
        : scheduleColorDefaultTitle(activityType)

  return {
    start_time: start.length === 4 ? `0${start}` : start,
    end_time: end.length === 4 ? `0${end}` : end,
    title,
    activity_type: activityType,
  }
}

function normalizeTemplate(raw: Partial<ScheduleTemplate>, usedIds: Set<string>): ScheduleTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const name =
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 48) : 'Untitled'
  let id =
    typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 40) : generateId()
  if (usedIds.has(id)) id = generateId()
  usedIds.add(id)

  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
    .map((block) => normalizeTemplateBlock(block ?? {}))
    .filter((block): block is ScheduleTemplateBlock => block != null)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const now = new Date().toISOString()
  return {
    id,
    name,
    blocks,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : now,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : now,
  }
}

export function normalizeScheduleTemplates(
  templates: ScheduleTemplate[] | undefined | null,
): ScheduleTemplate[] {
  const usedIds = new Set<string>()
  return (Array.isArray(templates) ? templates : [])
    .map((template) => normalizeTemplate(template, usedIds))
    .filter((template): template is ScheduleTemplate => template != null)
}

export function getScheduleTemplates(): ScheduleTemplate[] {
  try {
    const raw = storageGetItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return normalizeScheduleTemplates(Array.isArray(parsed) ? parsed : [])
  } catch {
    return []
  }
}

export function saveScheduleTemplates(templates: ScheduleTemplate[]): ScheduleTemplate[] {
  const normalized = normalizeScheduleTemplates(templates)
  storageSetItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event(SCHEDULE_TEMPLATES_CHANGED))
  return normalized
}

export function templateBlocksFromSchedule(blocks: ScheduleBlock[]): ScheduleTemplateBlock[] {
  return blocks
    .map((block) =>
      normalizeTemplateBlock({
        start_time: block.start_time,
        end_time: block.end_time,
        title: block.title,
        activity_type: block.activity_type,
      }),
    )
    .filter((block): block is ScheduleTemplateBlock => block != null)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
}

export function createScheduleTemplate(params: {
  name: string
  blocks: ScheduleBlock[] | ScheduleTemplateBlock[]
}): ScheduleTemplate {
  const now = new Date().toISOString()
  const fromSchedule = params.blocks.length > 0 && 'date' in params.blocks[0]!
  const blocks = fromSchedule
    ? templateBlocksFromSchedule(params.blocks as ScheduleBlock[])
    : (params.blocks as ScheduleTemplateBlock[])
        .map((block) => normalizeTemplateBlock(block))
        .filter((block): block is ScheduleTemplateBlock => block != null)

  return {
    id: generateId(),
    name: params.name.trim().slice(0, 48) || 'Untitled',
    blocks,
    created_at: now,
    updated_at: now,
  }
}

export function scheduleBlocksFromTemplate(
  template: ScheduleTemplate,
  targetDate: string,
  userId: string,
): ScheduleBlock[] {
  const now = new Date().toISOString()
  return template.blocks.map((block) => {
    const activityType = block.activity_type === 'grey' ? 'grey' : block.activity_type
    const base: ScheduleBlock = {
      id: generateId(),
      user_id: userId,
      date: targetDate,
      start_time: block.start_time,
      end_time: block.end_time,
      title: block.title,
      activity_type: activityType,
      color: activityType === 'grey' ? GREY_BLOCK_HEX : scheduleColorHex(activityType),
      created_at: now,
    }
    return normalizeScheduleBlock(base)
  })
}

export function summarizeScheduleTemplate(template: ScheduleTemplate): string {
  const count = template.blocks.length
  if (count === 0) return 'Empty'
  const first = template.blocks[0]!
  const last = template.blocks[count - 1]!
  return `${count} block${count === 1 ? '' : 's'} · ${first.start_time}–${last.end_time}`
}
