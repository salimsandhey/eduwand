// The website talks to the same API as the admin dashboard. Reads of the
// content pages and the contact form are public, so no sign-in is involved.
const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

interface ApiEnvelope<T> {
  data: T | null
  error?: { code: string; message: string; fields?: Record<string, string> }
}

export class ApiError extends Error {
  fields?: Record<string, string>

  constructor(message: string, fields?: Record<string, string>) {
    super(message)
    this.fields = fields
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    })
  } catch {
    throw new ApiError('Could not reach EduWand. Check your connection and try again.')
  }

  let body: ApiEnvelope<T> | null = null
  try {
    body = (await response.json()) as ApiEnvelope<T>
  } catch {
    // Non-JSON error page (proxy, gateway) - handled below.
  }
  if (!response.ok || !body || body.error) {
    throw new ApiError(body?.error?.message ?? 'Something went wrong. Please try again.', body?.error?.fields)
  }
  return body.data as T
}

// A page managed from Admin > Website pages (ContentPage in the backend).
export interface ContentPage {
  key: string
  title: string
  bodyMarkdown: string
  // Only the "contact" page has fields: { email, phone, whatsapp?, address, hours? }.
  fields: Record<string, string> | null
  updatedAt: string
}

// One request per page key for the lifetime of the tab: the footer and the
// contact page both want "contact". A failed request is not cached.
const pageCache = new Map<string, Promise<ContentPage>>()

export function getContentPage(key: string): Promise<ContentPage> {
  let pending = pageCache.get(key)
  if (!pending) {
    pending = request<ContentPage>(`/content-pages/${key}`)
    pageCache.set(key, pending)
    pending.catch(() => pageCache.delete(key))
  }
  return pending
}

export function joinWaitlist(input: { email: string; role: string }): Promise<{ received: boolean }> {
  return request('/public/waitlist', { method: 'POST', body: JSON.stringify(input) })
}

export interface ContactMessage {
  name: string
  email: string
  schoolName?: string
  role?: string
  subject?: string
  message: string
  // Honeypot - left empty by real visitors.
  website?: string
}

export function sendContactMessage(input: ContactMessage): Promise<{ received: boolean }> {
  return request('/public/contact', { method: 'POST', body: JSON.stringify(input) })
}
