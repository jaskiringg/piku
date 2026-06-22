import type { ServiceAccount } from '../types'
import { accountService } from '../AccountService'
import { refreshGoogle } from '../googleOAuth'

// Google Calendar via the Calendar REST API. Mirrors GmailConnector: the account's `token` is the
// OAuth access token (shared with Gmail via one consent — see googleOAuth.ts SCOPES); when it's
// expired we mint a new one from `refreshToken` and persist it. Read-only for now.

export interface CalendarEvent {
  id: string
  title: string
  start: string      // ISO or date string as returned by the API
  end: string
  location?: string
  attendees?: string[]
  meetLink?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
}

async function freshToken(account: ServiceAccount): Promise<string | null> {
  if (account.token && account.tokenExpiresAt && account.tokenExpiresAt > Date.now() + 60_000) return account.token
  if (!account.refreshToken) return account.token || null
  const r = await refreshGoogle(account.refreshToken)
  if (!r) return account.token || null
  await accountService.save({ ...account, token: r.accessToken, tokenExpiresAt: r.expiresAt, lastUsedAt: Date.now() })
  return r.accessToken
}

// Calendar API GETs go through Rust curl (no CORS), same as Gmail.
// Throws CalendarApiError on an API-level error (401/403/etc.) so callers can distinguish
// "no events" from "not authorised" and show an actionable reconnect prompt.
export class CalendarApiError extends Error {
  constructor(public code: number, message: string) { super(message) }
}

async function api<T>(token: string, path: string): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  const raw = await invoke<string>('http_get', { url: `https://www.googleapis.com/calendar/v3${path}`, authorization: `Bearer ${token}` })
  const data = JSON.parse(raw) as { error?: { code?: number; message?: string } } & T
  if (data?.error) throw new CalendarApiError(data.error.code ?? 0, data.error.message ?? 'Calendar API error')
  return data as T
}

function toISO(s: { dateTime?: string; date?: string } | undefined): string {
  return s?.dateTime ?? s?.date ?? ''
}

export class CalendarConnector {
  readonly service = 'calendar' as const
  readonly label = 'Google Calendar'

  async test(account: ServiceAccount): Promise<boolean> {
    const token = await freshToken(account)
    if (!token) return false
    try { await api<{ id: string }>(token, '/users/me/calendarList/primary'); return true }
    catch { return false }
  }

  // Upcoming events from the primary calendar, between timeMin and timeMax (ISO strings).
  // Throws CalendarApiError on 401/403 so the caller can distinguish missing auth from empty calendar.
  async list(account: ServiceAccount, timeMinISO: string, timeMaxISO: string, max = 20): Promise<CalendarEvent[]> {
    const token = await freshToken(account)
    if (!token) return []
    const q = new URLSearchParams({
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      maxResults: String(max),
      singleEvents: 'true',
      orderBy: 'startTime',
    }).toString()
    // api() throws CalendarApiError on an API-level error (e.g. 401 no calendar scope).
    const data = await api<{ items?: any[] }>(token, `/calendars/primary/events?${q}`)
    if (!data?.items) return []
    return data.items.map((it: any) => ({
      id:        it.id,
      title:     it.summary ?? '(no title)',
      start:     toISO(it.start),
      end:       toISO(it.end),
      location:  it.location,
      attendees: (it.attendees ?? []).map((a: any) => a.email).filter(Boolean),
      meetLink:  (it.conferenceData?.entryPoints ?? []).find((e: any) => e.entryPointType === 'video')?.uri,
      status:    it.status,
    }))
  }

  // Convenience: the next N upcoming events from now.
  async upcoming(account: ServiceAccount, max = 10): Promise<CalendarEvent[]> {
    const now = new Date()
    const horizon = new Date(now.getTime() + 14 * 864e5)   // 14-day lookahead by default
    return this.list(account, now.toISOString(), horizon.toISOString(), max)
  }

  async fetch(account: ServiceAccount): Promise<CalendarEvent[]> {
    return this.upcoming(account)
  }
}

export const calendarConnector = new CalendarConnector()
