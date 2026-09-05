import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function run() {
  // Check if table exists
  const { data, error } = await supabase.from('campaign_mappings').select('*').limit(1);
  if (error && error.code === '42P01') {
    console.log("Table doesn't exist, need to create it.");
  } else if (error) {
    console.log("Other error:", error);
  } else {
    console.log("Table exists.");
  }
}
run();
