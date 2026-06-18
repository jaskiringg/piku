import type { ServiceAccount } from '../types'

interface GitHubUser { login: string; id: number; avatar_url: string; name: string; public_repos: number }
interface GitHubRepo { id: number; name: string; full_name: string; description: string; html_url: string; language: string; stargazers_count: number; forks_count: number; updated_at: string; pushed_at: string }
interface GitHubEvent { id: string; type: string; repo: { name: string }; created_at: string; payload: Record<string, unknown> }

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}
async function get<T>(url: string, token?: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: headers(token) })
    return r.ok ? r.json() : null
  } catch { return null }
}

export class GitHubConnector {
  readonly service = 'github' as const
  readonly label = 'GitHub'

  async test(account: ServiceAccount): Promise<boolean> {
    const data = await get<GitHubUser>('https://api.github.com/user', account.token)
    return data !== null && (!account.username || data.login === account.username)
  }

  async getUser(account: ServiceAccount): Promise<GitHubUser | null> {
    if (account.token) return get<GitHubUser>('https://api.github.com/user', account.token)
    if (account.username) return get<GitHubUser>(`https://api.github.com/users/${account.username}`)
    return null
  }

  async listRepos(account: ServiceAccount): Promise<GitHubRepo[]> {
    if (account.token) {
      return (await get<GitHubRepo[]>('https://api.github.com/user/repos?per_page=30&sort=updated', account.token)) ?? []
    }
    if (account.username) {
      return (await get<GitHubRepo[]>(`https://api.github.com/users/${account.username}/repos?per_page=30&sort=updated`)) ?? []
    }
    return []
  }

  async recentEvents(account: ServiceAccount): Promise<GitHubEvent[]> {
    const username = account.username ?? (await this.getUser(account))?.login
    if (!username) return []
    return (await get<GitHubEvent[]>(`https://api.github.com/users/${username}/events?per_page=10`, account.token)) ?? []
  }

  // Commits authored by this account since a date (YYYY-MM-DD), including private repos the token
  // can read. Uses the Search Commits API — total is exact; the per-repo breakdown is from the
  // first page (up to 100). Returns null on auth/transport failure so callers can distinguish.
  async commitsSince(account: ServiceAccount, sinceISO: string): Promise<{ total: number; byRepo: Record<string, number> } | null> {
    const username = account.username ?? (await this.getUser(account))?.login
    if (!username) return null
    const q = encodeURIComponent(`author:${username} committer-date:>=${sinceISO}`)
    const data = await get<{ total_count: number; items: { repository?: { full_name: string } }[] }>(
      `https://api.github.com/search/commits?q=${q}&per_page=100&sort=committer-date&order=desc`,
      account.token,
    )
    if (!data) return null
    const byRepo: Record<string, number> = {}
    for (const it of data.items ?? []) {
      const name = it.repository?.full_name
      if (name) byRepo[name] = (byRepo[name] ?? 0) + 1
    }
    return { total: data.total_count ?? 0, byRepo }
  }

  async getRepoDetails(account: ServiceAccount, repo: string): Promise<GitHubRepo | null> {
    const username = account.username ?? (await this.getUser(account))?.login
    if (!username) return null
    const fullName = repo.includes('/') ? repo : `${username}/${repo}`
    return get<GitHubRepo>(`https://api.github.com/repos/${fullName}`, account.token)
  }

  async fetch(account: ServiceAccount, _query?: string): Promise<{ user: GitHubUser | null; repos: GitHubRepo[]; events: GitHubEvent[] }> {
    const [user, repos, events] = await Promise.all([
      this.getUser(account), this.listRepos(account), this.recentEvents(account),
    ])
    return { user, repos, events }
  }
}

export const gitHubConnector = new GitHubConnector()
