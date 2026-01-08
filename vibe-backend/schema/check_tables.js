const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function checkTables() {
    try {
        await client.connect();
        const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
        console.log("Tables in public schema:");
        res.rows.forEach(row => console.log(`- ${row.table_name}`));
    } catch (err) {
        console.error("Error connecting or querying:", err);
    } finally {
        await client.end();
    }
}

checkTables();
