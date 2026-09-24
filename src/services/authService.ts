/**
 * authService.ts
 * Wraps our new Neon DB PIN auth setup, masquerading as Supabase Auth.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase'

export interface AuthUser {
  id: string
  name: string
  mobile: string
  email: string
  role: 'admin' | 'customer'
}

const USE_LOCAL_AUTH_FALLBACK = import.meta.env.DEV && !isSupabaseConfigured

type LocalUser = {
  id: string
  name: string
  mobile: string
  email: string
  password: string
  role: 'admin' | 'customer'
  created_at: string
  orders: unknown[]
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return null
}

const normalizeLocalUser = (value: unknown): LocalUser | null => {
  const record = asRecord(value)
  if (!record) return null

  const id = typeof record.id === 'string' ? record.id : ''
  const email = typeof record.email === 'string' ? record.email : ''
  if (!id || !email) return null

  return {
    id,
    name: typeof record.name === 'string' ? record.name : 'Customer',
    mobile: typeof record.mobile === 'string' ? record.mobile : '',
    email,
    password: typeof record.password === 'string' ? record.password : '',
    role: record.role === 'admin' ? 'admin' : 'customer',
    created_at: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
    orders: Array.isArray(record.orders) ? record.orders : [],
  }
}

// Helper for localStorage fallback
const getUsers = (): LocalUser[] => {
  try {
    const raw = localStorage.getItem('ul_users') || '[]'
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => normalizeLocalUser(entry))
      .filter((entry): entry is LocalUser => entry !== null)
  } catch {
    return []
  }
}

const saveUsers = (u: LocalUser[]) => localStorage.setItem('ul_users', JSON.stringify(u))

const getProductionAuthError = () => ({ user: null, error: 'Database API is required for authentication in production' })

// ── auth exposed API ─────────────────────────────────────────
export const authService = {

  signUp: async (params: {
    email: string
    password: string
    name: string
    mobile: string
  }): Promise<{ user: AuthUser | null; error: string | null }> => {
    if (isSupabaseConfigured) {
      // In the new Neon PIN setup, sign ups are not really supported via this API.
      // We just mock it for now.
      return { user: null, error: 'Sign up is not supported in this POS version' }
    }

    if (!USE_LOCAL_AUTH_FALLBACK) {
      return getProductionAuthError()
    }

    // localStorage fallback
    const users = getUsers()
    if (users.find((u) => u.email === params.email)) {
      return { user: null, error: 'Email already registered' }
    }
    const newUser: LocalUser = {
      id: Date.now().toString(),
      name: params.name,
      mobile: params.mobile,
      email: params.email,
      password: params.password,
      role: 'customer',
      created_at: new Date().toISOString(),
      orders: [],
    }
    saveUsers([...users, newUser])
    localStorage.setItem('ul_session', JSON.stringify(newUser))
    return { user: { id: newUser.id, name: newUser.name, mobile: newUser.mobile, email: newUser.email, role: 'customer' }, error: null }
  },

  signIn: async (email: string, password: string): Promise<{ user: AuthUser | null; error: string | null }> => {
    // Allow login with mobile number (convert to email)
    const loginEmail = email.includes('@') ? email : email  // pass through, handled below

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
      if (error || !data?.user) return { user: null, error: error?.message || 'Invalid credentials' }

      const userObj = {
        id: data.user.id,
        name: data.user.name,
        mobile: '',
        email: data.user.id,
        role: data.user.role as 'admin' | 'customer'
      }
      localStorage.setItem('ul_session', JSON.stringify(userObj))
      
      return {
        user: userObj,
        error: null,
      }
    }

    if (!USE_LOCAL_AUTH_FALLBACK) {
      return { user: null, error: 'Database API is required for authentication in production' }
    }

    // localStorage fallback — support email or mobile login
    const users = getUsers()
    const match = users.find((u) =>
      (u.email === loginEmail || u.mobile === loginEmail) && u.password === password
    )
    if (!match) return { user: null, error: 'Invalid credentials' }
    localStorage.setItem('ul_session', JSON.stringify(match))
    return { user: { id: match.id, name: match.name, mobile: match.mobile, email: match.email, role: match.role }, error: null }
  },

  signOut: async (): Promise<void> => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
    localStorage.removeItem('ul_session')
  },

  getCurrentUser: async (): Promise<AuthUser | null> => {
    const sid = localStorage.getItem('ul_session')
    if (!sid) return null
    try {
       const user = JSON.parse(sid)
       return user as AuthUser
    } catch {
       return null
    }
  },

  updateProfile: async (updates: { name?: string; mobile?: string }): Promise<{ error: string | null }> => {
    return { error: 'Profile updates not supported via this interface currently' }
  },

  onAuthStateChange: (callback: (user: AuthUser | null) => void) => {
    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: string, session: any) => {
        if (session?.user) {
          callback(session.user)
        } else {
          callback(null)
        }
      })
      return () => subscription.unsubscribe()
    }
    if (!USE_LOCAL_AUTH_FALLBACK) {
      callback(null)
      return () => {}
    }

    // No-op for localStorage mode
    return () => {}
  },

  verifyOtp: async (email: string, token: string): Promise<{ error: string | null }> => {
    return { error: 'OTP verification not supported' }
  },
}
