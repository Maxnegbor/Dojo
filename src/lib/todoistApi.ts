import { getTodoistToken } from '@/lib/todoistStore'

const REST_BASE = 'https://api.todoist.com/rest/v2'

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
    'Content-Type': 'application/json',
  }
}

async function todoistFetch<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<T> {
  const token = init?.token ?? getTodoistToken()
  if (!token) throw new TodoistApiError('Todoist is not connected', 401)

  const { token: _token, ...requestInit } = init ?? {}
  const res = await fetch(`${REST_BASE}${path}`, {
    ...requestInit,
    headers: {
      ...authHeaders(token),
      ...(requestInit.headers ?? {}),
    },
  })

  if (!res.ok) {
    let detail = res.statusText || 'Request failed'
    try {
      const body = (await res.json()) as { error?: string; error_description?: string }
      detail = body.error_description || body.error || detail
    } catch {
      /* ignore */
    }
    throw new TodoistApiError(detail, res.status)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/** Validate a token by listing projects. */
export async function verifyTodoistToken(token: string): Promise<void> {
  await todoistFetch<unknown[]>('/projects', { token: token.trim(), method: 'GET' })
}

export function buildTodoistFilter(viewDate: string, today: string): string {
  if (viewDate === today) return 'today | overdue'
  return `due: ${viewDate}`
}

export async function fetchTodoistTasks(filter: string): Promise<TodoistTask[]> {
  const params = new URLSearchParams({ filter })
  const tasks = await todoistFetch<TodoistTask[]>(`/tasks?${params.toString()}`)
  return (tasks ?? [])
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
  return todoistFetch<TodoistTask>('/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  })
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
  return todoistFetch<TodoistTask>(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'POST',
    body: JSON.stringify({ content: content.trim() }),
  })
}
