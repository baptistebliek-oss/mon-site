import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mcvvibqakpxtclcjvfqa.supabase.co'
const supabaseAnonKey = 'sb_publishable_LqRc3sukDBoUrXurB3g4EQ_cMa8zIXb'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)