
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_Supabase_Project_URL || '';
const supabaseKey = import.meta.env.VITE_Supabase_Publishable_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key missing from environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
