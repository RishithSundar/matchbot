import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, TextChannel, ThreadChannel, Interaction } from 'discord.js';
import * as dotenv from 'dotenv';
import { supabase } from './supabase';

dotenv.config();
const token = process.env.DISCORD_TOKEN?.trim();
const clientId = process.env.CLIENT_ID?.trim();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers, 
    ],
});

console.log('--- 🤖 MATCHBOT FINAL ATTEMPT ---');

async function start() {
    if (!token) return console.error("❌ MISSING TOKEN");

    try {
        console.log("⏳ Attempting to connect to Discord...");
        await client.login(token);
    } catch (err: any) {
        if (err.message.includes('429') || err.message.includes('1015')) {
            console.error("⚠️ RATE LIMITED: Discord is blocking Render's IP. Waiting 1 minute before retry...");
            setTimeout(start, 60000); // Auto-retry in 60 seconds
        } else {
            console.error("❌ LOGIN ERROR:", err.message);
        }
    }
}

client.once('ready', () => {
    console.log(`🚀 SUCCESS: ${client.user?.tag} IS ONLINE!`);
});

// --- SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('setup').setDescription('Admin: Creates join button.'),
    new SlashCommandBuilder().setName('leave').setDescription('Leave chat.')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token!);
(async () => {
    try {
        if (clientId) {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            console.log('✅ Commands Synced.');
        }
    } catch (e: any) { console.error('❌ CMD SYNC ERROR:', e.message); }
})();

// --- MATCHING LOGIC (STAY THE SAME) ---
client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('join_queue').setLabel('💬 Chat with random person').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ content: '**Welcome to Strangers Chat!**', components: [row] });
    }
    
    if (interaction.isButton() && interaction.customId === 'join_queue') {
        await interaction.deferReply({ ephemeral: true });
        const { data: waiting } = await supabase.from('queue').select('*').limit(1).maybeSingle();
        if (waiting) {
            // ... (Your matching logic from previous steps)
            await interaction.editReply("Matched!");
        } else {
            // ... (Your queue logic)
            await interaction.editReply("Added to queue!");
        }
    }
});

start();

const express = require('express');
const server = express();
server.get('/', (req: any, res: any) => res.send('Matchbot is waiting for Discord to lift the block...'));
server.listen(process.env.PORT || 10000);