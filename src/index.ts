import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();
const token = process.env.DISCORD_TOKEN?.trim();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers, 
    ],
});

console.log('--- 🛡️ DIAGNOSTIC MODE ---');

if (!token) {
    console.error("❌ ERROR: No token found in Render Dashboard!");
} else {
    console.log(`⏳ Step 1: Requesting connection...`);

    client.login(token)
        .then(() => {
            console.log(`🚀 STEP 2 SUCCESS: ${client.user?.tag} IS GREEN!`);
        })
        .catch(err => {
            console.error("❌ STEP 2 FAILED:", err.message);
        });
}

client.once('ready', () => {
    console.log(`✅ DISCORD HAS ACCEPTED THE BOT.`);
});

// Minimal Web Server to keep Render happy
const express = require('express');
const server = express();
server.get('/', (req: any, res: any) => res.send('Diagnostics Running...'));
server.listen(process.env.PORT || 10000, () => console.log('🌐 Web server port open.'));