const { Client } = require("pg");
require('dotenv').config({ path: '../.env' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const schildTeamId = "a2f22deb-901e-436b-9755-644cb26753b7";

// Clerk IDs for the 3 users
const clerkMapping = {
  "e.prummer@schwarzschild.eu": "user_3817iDrs5q0bET5K8TpzSYFVCkc",
  "sebastianhinz.chronicles@gmail.com": "user_381OyGvUzTYoyJxrCZY25itTDwX",
  "chrisgerlach97@gmail.com": "user_381Y5htpVWTivvBNxw41Tb5rFE6"
};

async function run() {
  await client.connect();
  console.log("Connected!");

  // Show current Schild team members with their IDs
  console.log("\n=== CURRENT SCHILD TEAM MEMBERS (DATABASE) ===");
  const members = await client.query(`
    SELECT id, email, display_name, clerk_user_id, created_at
    FROM team_members WHERE team_id = $1 ORDER BY email
  `, [schildTeamId]);
  members.rows.forEach(r => {
    console.log(`${r.email}`);
    console.log(`  ID: ${r.id}`);
    console.log(`  clerk_user_id: ${r.clerk_user_id}`);
    console.log(`  created_at: ${r.created_at}`);
    console.log("");
  });

  await client.end();
}

run().catch(e => console.error("Error:", e.message));
