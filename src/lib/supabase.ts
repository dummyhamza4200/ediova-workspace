import { createClient } from '@supabase/supabase-js';

// Public browser settings only. Never expose a service-role or secret key here.
const defaultUrl = 'https://xtiscozfkmjnvpdrxpys.supabase.co';
const defaultPublishableKey = 'sb_publishable_17H84QN3NaUkKxC_ugEFDw_02LRxlzR';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || defaultUrl;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  || defaultPublishableKey;

export const isSupabaseConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'));

// Persist this user's Supabase session in this browser so they can return directly to their workspace. Sign out on shared devices.
export const supabase = isSupabaseConfigured ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;
