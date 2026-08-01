import { getTodoistToken } from '@/lib/todoistStore'

const API_BASE = 'https://api.todoist.com/api/v1'

export interface TodoistDue {
  date: string
  string?: string
  datetime?: string | null
  is_recurring?: boolean
}

export interface TodoistTask {
  id: string
  content: string
  description: string
  project_id: string
  priority: number
  due: TodoistDue | null
  url: string
  is_completed: boolean
  labels: string[]
}

interface TodoistTaskRaw {
  id: string
  content: string
  description?: string
  project_id: string
  priority?: number
  due?: TodoistDue | null
  url?: string
  checked?: boolean
  is_completed?: boolean
  labels?: string[]
}

interface Paginated<T> {
  results?: T[]
  next_cursor?: string | null
}

export class TodoistApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TodoistApiError'
    this.status = status
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

function normalizeTask(raw: TodoistTaskRaw): TodoistTask {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    description: raw.description ?? '',
    project_id: String(raw.project_id),
    priority: typeof raw.priority === 'number' ? raw.priority : 1,
    due: raw.due ?? null,
    url: raw.url ?? `https://todoist.com/app/task/${raw.id}`,
    is_completed: Boolean(raw.is_completed ?? raw.checked),
    labels: Array.isArray(raw.labels) ? raw.labels : [],
  }
}

async function todoistFetch<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<T> {
  const token = init?.token ?? getTodoistToken()
  if (!token) throw new TodoistApiError('Todoist is not connected', 401)

  const { token: _token, ...requestInit } = init ?? {}
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...requestInit,
      headers: {
        ...authHeaders(token),
        ...(requestInit.headers ?? {}),
      },
    })
  } catch {
    throw new TodoistApiError(
      'Could not reach Todoist. Check your connection and try again.',
      0,
    )
  }

  if (!res.ok) {
    let detail = res.statusText || 'Request failed'
    if (res.status === 410) {
      detail = 'Todoist API endpoint is outdated. Update Dojo and try again.'
    } else if (res.status === 401 || res.status === 403) {
      detail = 'Invalid Todoist token. Regenerate it in Todoist and paste it again.'
    } else {
      try {
        const body = (await res.json()) as {
          error?: string
          error_description?: string
          error_tag?: string
        }
        detail = body.error_description || body.error || body.error_tag || detail
      } catch {
        /* ignore */
      }
    }
    throw new TodoistApiError(detail, res.status)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text || text === 'null') return undefined as T
  return JSON.parse(text) as T
}

/** Validate a token by listing projects. */
export async function verifyTodoistToken(token: string): Promise<void> {
  await todoistFetch<Paginated<unknown>>('/projects?limit=1', {
    token: token.trim(),
    method: 'GET',
  })
}

export function buildTodoistFilter(viewDate: string, today: string): string {
  if (viewDate === today) return 'today | overdue'
  return `due: ${viewDate}`
}

async function fetchAllFilteredTasks(query: string): Promise<TodoistTask[]> {
  const tasks: TodoistTask[] = []
  let cursor: string | null = null

  do {
    const params = new URLSearchParams({ query, limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const page = await todoistFetch<Paginated<TodoistTaskRaw>>(
      `/tasks/filter?${params.toString()}`,
    )
    const rows = page?.results ?? []
    for (const row of rows) tasks.push(normalizeTask(row))
    cursor = page?.next_cursor ?? null
  } while (cursor)

  return tasks
}

export async function fetchTodoistTasks(filter: string): Promise<TodoistTask[]> {
  const tasks = await fetchAllFilteredTasks(filter)
  return tasks
    .filter((task) => !task.is_completed)
    .sort((a, b) => {
      const ap = b.priority - a.priority
      if (ap !== 0) return ap
      const ad = a.due?.date ?? '9999'
      const bd = b.due?.date ?? '9999'
      if (ad !== bd) return ad.localeCompare(bd)
      return a.content.localeCompare(b.content)
    })
}

export async function createTodoistTask(params: {
  content: string
  dueDate?: string
}): Promise<TodoistTask> {
  const body: Record<string, unknown> = {
    content: params.content.trim(),
  }
  if (params.dueDate) {
    body.due_date = params.dueDate
  }
  const created = await todoistFetch<TodoistTaskRaw>('/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return normalizeTask(created)
}

export async function completeTodoistTask(taskId: string): Promise<void> {
  await todoistFetch<void>(`/tasks/${encodeURIComponent(taskId)}/close`, {
    method: 'POST',
  })
}

export async function updateTodoistTaskContent(
  taskId: string,
  content: string,
): Promise<TodoistTask> {
  const updated = await todoistFetch<TodoistTaskRaw>(
    `/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ content: content.trim() }),
    },
  )
  return normalizeTask(updated)
}
