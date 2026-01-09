import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { v4 as uuidv4 } from 'uuid';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

const schildTeamId = 'a2f22deb-901e-436b-9755-644cb26753b7';

const members = [
  { email: 'e.prummer@schwarzschild.eu', clerkUserId: 'user_3817iDrs5q0bET5K8TpzSYFVCkc', displayName: 'E. Prummer' },
  { email: 'sebastianhinz.chronicles@gmail.com', clerkUserId: 'user_381OyGvUzTYoyJxrCZY25itTDwX', displayName: 'Sebastian Hinz' },
  { email: 'chrisgerlach97@gmail.com', clerkUserId: 'user_381Y5htpVWTivvBNxw41Tb5rFE6', displayName: 'Chris Gerlach' },
];

async function addMembers() {
  for (const member of members) {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    try {
      await client`
        INSERT INTO team_members (id, team_id, email, display_name, role, clerk_user_id, joined_at, created_at, updated_at)
        VALUES (${id}, ${schildTeamId}, ${member.email}, ${member.displayName}, 'contributor', ${member.clerkUserId}, ${now}, ${now}, ${now})
        ON CONFLICT (team_id, email) DO NOTHING
      `;
      console.log(`Added ${member.email} to Schild team`);
    } catch (e: any) {
      console.error(`Failed to add ${member.email}:`, e.message);
    }
  }
  
  // Also delete any pending invitations for these emails
  for (const member of members) {
    try {
      await client`
        DELETE FROM team_invitations 
        WHERE team_id = ${schildTeamId} AND email = ${member.email}
      `;
      console.log(`Cleaned up invitations for ${member.email}`);
    } catch (e: any) {
      console.error(`Failed to clean invitations for ${member.email}:`, e.message);
    }
  }
  
  await client.end();
  console.log('Done!');
}

addMembers();
