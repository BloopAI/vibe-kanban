const dotenv = require('dotenv');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
console.log('Loading env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env:', result.error);
} else {
    console.log('.env loaded successfully');
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('DATABASE_URL is not defined');
} else {
    console.log('DATABASE_URL length:', dbUrl.length);
    if (dbUrl.includes('[YOUR-PASSWORD]')) {
        console.error('CRITICAL: DATABASE_URL still contains placeholder [YOUR-PASSWORD]');
    } else {
        console.log('DATABASE_URL does NOT contain placeholder.');
        // mask password for safety
        const masked = dbUrl.replace(/:([^:@]+)@/, ':****@');
        console.log('Loaded URL:', masked);
    }
}
