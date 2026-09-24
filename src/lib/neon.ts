// src/lib/neon.ts
// Drop-in HTTP client that talks to our Vercel API routes instead of Supabase.

const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

export const neonClient = {
  from(table: string) {
    return new QueryBuilder(table)
  },
  channel(name: string) {
    const mockChannel = {
      on() { return mockChannel },
      subscribe(callback?: (status: string) => void) {
        if (callback) callback('SUBSCRIBED')
        return mockChannel
      },
      unsubscribe() {}
    }
    return mockChannel
  },
  removeChannel(channel: any) {
    // No-op
  },
  rpc(fn: string, params: Record<string, unknown>) {
    return request('/rpc?fn=' + fn, { method: 'POST', body: JSON.stringify(params) })
      .then(data => ({ data, error: null }))
      .catch(e => ({ data: null, error: { message: (e as Error).message } }))
  },
  auth: {
    async signInWithPassword({ email, password }: { email?: string; password: string }) {
      try {
        const user = await request<{ role: string; name: string; id: string }>('/auth', {
          method: 'POST',
          body: JSON.stringify({ id: email, password }),
        })
        return { data: { user }, error: null }
      } catch (e) {
        return { data: { user: null }, error: { message: (e as Error).message } }
      }
    },
    async getUser() {
      const stored = localStorage.getItem('ul_session')
      if (!stored) return { data: { user: null } }
      return { data: { user: JSON.parse(stored) } }
    },
    async signOut() {
      localStorage.removeItem('ul_session')
      return { error: null }
    },
    onAuthStateChange(callback: (event: string, session: unknown) => void) {
      const stored = localStorage.getItem('ul_session')
      callback('SIGNED_IN', stored ? { user: JSON.parse(stored) } : null)
      return { data: { subscription: { unsubscribe: () => {} } } }
    }
  }
}

class QueryBuilder {
  private _table: string
  private _filters: string[] = []
  private _select: string = '*'
  private _order: string = ''
  private _limit: number | null = null
  private _single = false

  constructor(table: string) {
    this._table = table
  }

  select(cols: string) { this._select = cols; return this }
  eq(col: string, val: unknown) { this._filters.push(`${col}=${encodeURIComponent(String(val))}`); return this }
  neq(col: string, val: unknown) { this._filters.push(`${col}=neq.${encodeURIComponent(String(val))}`); return this }
  gte(col: string, val: unknown) { this._filters.push(`${col}=gte.${encodeURIComponent(String(val))}`); return this }
  lte(col: string, val: unknown) { this._filters.push(`${col}=lte.${encodeURIComponent(String(val))}`); return this }
  order(col: string, { ascending } = { ascending: true }) { this._order = `${col}.${ascending ? 'asc' : 'desc'}`; return this }
  limit(n: number) { this._limit = n; return this }
  range(from: number, to: number) { this._limit = to - from + 1; return this }
  single() { this._single = true; return this }

  private _endpoint() {
    // If we have a dedicated route, use it. Otherwise use generic query.js
    const dedicated = ['products']
    if (dedicated.includes(this._table)) return '/' + this._table
    return '/query?table=' + this._table
  }

  async get() {
    const params = new URLSearchParams()
    if (!dedicated.includes(this._table)) params.set('table', this._table)
    
    this._filters.forEach(f => { const [k,v] = f.split('='); params.set(k, v) })
    if (this._order) params.set('order', this._order)
    if (this._limit) params.set('limit', String(this._limit))
    
    const qs = params.toString()
    const base = this._table === 'products' ? '/products' : '/query'
    
    try {
      const data = await request<unknown[]>(`${base}${qs ? '?' + qs : ''}`)
      if (this._single) return { data: Array.isArray(data) ? data[0] ?? null : data, error: null }
      return { data, error: null, count: Array.isArray(data) ? data.length : 0 }
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } }
    }
  }

  async insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    const body = Array.isArray(payload) ? payload[0] : payload
    const endpoint = this._table === 'products' ? '/products' : '/query?table=' + this._table
    try {
      const data = await request<unknown>(endpoint, { method: 'POST', body: JSON.stringify(body) })
      return { data, error: null }
    } catch(e) { return { data: null, error: { message: (e as Error).message } } }
  }

  async update(payload: Record<string, unknown>) {
    // requires eq filter to have id
    const idFilter = this._filters.find(f => f.startsWith('id='))
    const id = idFilter ? idFilter.split('=')[1] : null
    const endpoint = this._table === 'products' ? '/products' : '/query?table=' + this._table
    try {
      const data = await request<unknown>(endpoint, { method: 'PATCH', body: JSON.stringify({ id, ...payload }) })
      return { data, error: null }
    } catch(e) { return { data: null, error: { message: (e as Error).message } } }
  }

  async delete() {
    const idFilter = this._filters.find(f => f.startsWith('id='))
    const id = idFilter ? idFilter.split('=')[1] : null
    const endpoint = this._table === 'products' ? '/products' : '/query?table=' + this._table
    try {
      await request<unknown>(endpoint, { method: 'DELETE', body: JSON.stringify({ id }) })
      return { data: null, error: null }
    } catch(e) { return { data: null, error: { message: (e as Error).message } } }
  }

  // Chaining helpers
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    return this.get().then(resolve, reject)
  }
}

const dedicated = ['products']
