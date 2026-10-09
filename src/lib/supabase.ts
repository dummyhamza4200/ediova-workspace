import { createClient } from '@supabase/supabase-js';

// These are intentionally public browser settings (Supabase publishable key, not service_role).
// Environment variables may override them for preview/staging projects.
const defaultUrl = 'https://xtiscozfkmjnvpdrxpys.supabase.co';
const defaultPublishableKey = 'sb_publishable_17H84QN3NaUkKxC_ugEFDw_02LRxlzR';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || defaultUrl;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  || defaultPublishableKey;

export const isSupabaseConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'));
export const supabase = isSupabaseConfigured ? createClient(url, key) : null;
