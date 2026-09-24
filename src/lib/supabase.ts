// src/lib/supabase.ts
// Re-exports the Neon HTTP client for backward compatibility with existing code
import { neonClient } from './neon'

export const supabase = neonClient as any
export const isSupabaseConfigured = true
