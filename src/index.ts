import { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, TextChannel, ThreadChannel, Interaction 
} from 'discord.js';
import * as dotenv from 'dotenv';
import { supabase } from './supabase';

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

console.log('--- 🤖 MATCHBOT INITIALIZING ---');

if (!token || token.length < 50) {
    console.error("❌ ERROR: DISCORD_TOKEN is invalid or missing!");
} else {
    // AUTO-DETECT CLIENT ID (Prevents mismatch errors)
    const detectedId = Buffer.from(token.split('.')[0], 'base64').toString();
    console.log(`🔍 Handshake started for ID: ${detectedId}`);

    client.login(token).catch(err => console.error("❌ LOGIN FAILED:", err.message));

    // SYNC COMMANDS
    const commands = [
        new SlashCommandBuilder().setName('setup').setDescription('Admin: Creates join button.'),
        new SlashCommandBuilder().setName('leave').setDescription('Leave chat.')
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    (async () => {
        try {
            await rest.put(Routes.applicationCommands(detectedId), { body: commands });
            console.log('✅ Slash commands synced.');
        } catch (e: any) {
            console.error('❌ CMD ERROR:', e.message);
        }
    })();
}

client.once('ready', () => {
    console.log(`🚀 SUCCESS: ${client.user?.tag} IS ONLINE!`);
});

// --- MATCHING LOGIC ---
client.on('interactionCreate', async (interaction: Interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('join_queue').setLabel('💬 Chat with random person').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ content: '**Welcome to Strangers Chat!**\nClick below to start.', components: [row] });
    }

    if (interaction.isButton() && interaction.customId === 'join_queue') {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;
        const channel = interaction.channel as TextChannel;

        const { data: waiting } = await supabase.from('queue').select('*').limit(1).maybeSingle();

        if (waiting) {
            await supabase.from('queue').delete().eq('discord_id', waiting.discord_id);
            const thread = client.channels.cache.get(waiting.thread_id) as ThreadChannel;
            if (thread) {
                await thread.members.add(userId);
                await supabase.from('active_chats').insert({
                    user1_id: waiting.discord_id, user1_thread_id: thread.id,
                    user2_id: userId, user2_thread_id: thread.id
                });
                await thread.send(`Matched! <@${waiting.discord_id}> and <@${userId}>, say hi! 💬`);
                return interaction.editReply(`Match found: <#${thread.id}>`);
            }
        } else {
            const thread = await channel.threads.create({ name: `Private Chat`, type: ChannelType.PrivateThread });
            await thread.members.add(userId);
            await supabase.from('queue').insert({ discord_id: userId, thread_id: thread.id });
            await thread.send(`Looking for a match for <@${userId}>... 👀`);
            return interaction.editReply(`Waiting in: <#${thread.id}>`);
        }
    }
});

// WEB SERVER (For Render)
const express = require('express');
const server = express();
server.get('/', (req: any, res: any) => res.send('Matchbot Alive!'));
server.listen(process.env.PORT || 3000, () => console.log('🌐 Web server live.'));