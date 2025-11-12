// Supabase Configuration
// IMPORTANT: Replace these placeholder values with your actual Supabase credentials
// After creating your Supabase project:
// 1. Go to Settings > API in your Supabase dashboard
// 2. Copy the Project URL and anon/public key
// 3. Replace the values below

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE'; // e.g., 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE'; // e.g., 'eyJhbGc...'

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other files
window.supabaseClient = supabase;
