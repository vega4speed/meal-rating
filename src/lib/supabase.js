import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  )
}

// This app's tables live in the `meals` schema inside the shared oil-tracker
// project — never `public`. Pinning the schema here means every .from()/.rpc()
// resolves inside `meals` with no per-query ceremony. See PLAN.md.
export const supabase = createClient(url, anonKey, {
  db: { schema: 'meals' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
