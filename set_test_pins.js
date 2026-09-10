import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function run() {
  console.log("Fetching sales users...");
  // Get users
  const { data: users, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error("Error fetching users:", error);
    return;
  }
  
  const salesUsers = users.users.filter(u => u.app_metadata?.role === 'sales');
  
  if (salesUsers.length === 0) {
    console.log("No sales users found. Creating some test accounts...");
    for (let i = 1; i <= 3; i++) {
      const email = `sales_rep_${i}@yourcompany.com`;
      const { data, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: 'Password123!',
        email_confirm: true,
        user_metadata: {
          full_name: `Sales Rep ${i}`,
          pin_code: '1234'
        },
        app_metadata: {
          role: 'sales'
        }
      });
      if (createError) {
        console.error(`Error creating ${email}:`, createError);
      } else {
        console.log(`Created ${email} with PIN 1234`);
      }
    }
  } else {
    console.log(`Found ${salesUsers.length} sales users. Updating PINs to 1234...`);
    for (const user of salesUsers) {
      const { data, error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { user_metadata: { ...user.user_metadata, pin_code: '1234' } }
      );
      if (updateError) {
        console.error(`Error updating ${user.email}:`, updateError);
      } else {
        console.log(`Updated PIN for ${user.email}`);
      }
    }
  }
}

run();

