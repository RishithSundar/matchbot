import * as https from 'https';
import * as dotenv from 'dotenv';

dotenv.config();
const token = process.env.DISCORD_TOKEN?.trim();

console.log('--- 🧪 SURGICAL TOKEN TEST ---');

if (!token) {
    console.log("❌ ERROR: No token found in Render environment.");
} else {
    console.log(`📡 Sending direct request to Discord API...`);

    const options = {
        hostname: 'discord.com',
        path: '/api/v10/users/@me',
        method: 'GET',
        headers: { 'Authorization': `Bot ${token}` }
    };

    const req = https.request(options, (res) => {
        console.log(`📊 Response Status: ${res.statusCode}`);
        
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                const bot = JSON.parse(data);
                console.log(`🚀 SUCCESS! Token is valid.`);
                console.log(`🤖 Bot Name: ${bot.username}#${bot.discriminator}`);
                console.log(`✅ If you see this, the token is 100% correct.`);
            } else if (res.statusCode === 401) {
                console.log(`❌ ERROR 401: This token is INVALID or RESET.`);
            } else {
                console.log(`❓ UNKNOWN ERROR: ${data}`);
            }
        });
    });

    req.on('error', (e) => console.error(`❌ NETWORK ERROR: ${e.message}`));
    req.end();
}

// Keep server alive for Render
const express = require('express');
const server = express();
server.get('/', (req: any, res: any) => res.send('Testing...'));
server.listen(process.env.PORT || 10000);