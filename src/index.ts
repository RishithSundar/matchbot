import { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, TextChannel, ThreadChannel, Interaction 
} from 'discord.js';
import * as dotenv from 'dotenv';
import { supabase } from './supabase';

// 1. Initialize Environment
dotenv.config();
const token = process.env.DISCORD_TOKEN?.trim();
const clientId = process.env.CLIENT_ID?.trim();

// 2. Initialize Discord Client with all required Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers, // Required to add users to threads
    ],
});

// 3. PRIORITY LOGIN (Connect to Discord first)
console.log('--- MATCHBOT STARTUP ---');
if (!token) {
    console.error("❌ CRITICAL: DISCORD_TOKEN is missing in Environment Variables!");
} else {
    console.log(`⏳ Attempting Login... (Token length: ${token.length})`);
    client.login(token).catch(err => {
        console.error("❌ DISCORD LOGIN ERROR:", err.message);
    });
}

client.once('ready', () => {
    console.log(`🚀 SUCCESS: ${client.user?.tag} is online and connected!`);
});

// 4. REGISTER SLASH COMMANDS
const commands = [
    new SlashCommandBuilder().setName('setup').setDescription('Admin: Creates the chat join button.'),
    new SlashCommandBuilder().setName('leave').setDescription('Leave your current chat or queue.')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token!);

(async () => {
    try {
        if (!clientId) throw new Error("CLIENT_ID is missing!");
        console.log('⏳ Syncing Slash Commands...');
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Commands synced successfully.');
    } catch (error: any) {
        console.error('❌ COMMAND REGISTRATION ERROR:', error.message);
    }
})();

// 5. BOT INTERACTION LOGIC
client.on('interactionCreate', async (interaction: Interaction) => {
    
    // /setup Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('join_queue').setLabel('💬 Chat with random person').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ content: '**Welcome to Strangers Chat!**\nClick below to start a chat.', components: [row] });
        return;
    }

    // /leave Command
    if (interaction.isChatInputCommand() && interaction.commandName === 'leave') {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;

        const { data: queueData } = await supabase.from('queue').select('*').eq('discord_id', userId).single();
        if (queueData) {
            await supabase.from('queue').delete().eq('discord_id', userId);
            const thread = client.channels.cache.get(queueData.thread_id) as ThreadChannel;
            if (thread) await thread.delete().catch(() => {});
            return interaction.editReply('You left the queue.');
        }

        const { data: chatData } = await supabase.from('active_chats').select('*').or(`user1_id.eq.${userId},user2_id.eq.${userId}`).single();
        if (chatData) {
            await supabase.from('active_chats').delete().eq('id', chatData.id);
            const sharedThread = client.channels.cache.get(chatData.user1_thread_id) as ThreadChannel;
            if (sharedThread) {
                await sharedThread.send('🔴 **A user has left the chat. Closing room in 5 seconds...**');
                setTimeout(() => sharedThread.delete().catch(() => {}), 5000);
            }
            return interaction.editReply('You left the chat.');
        }
        return interaction.editReply('You are not in a chat!');
    }

    // "Chat with random person" Button Logic
    if (interaction.isButton() && interaction.customId === 'join_queue') {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;
        const channel = interaction.channel as TextChannel;

        const { data: inQueue } = await supabase.from('queue').select('*').eq('discord_id', userId).single();
        const { data: inChat } = await supabase.from('active_chats').select('*').or(`user1_id.eq.${userId},user2_id.eq.${userId}`).single();
        
        if (inQueue || inChat) return interaction.editReply('You are already in a chat or queue! Use `/leave` to exit.');

        const { data: waitingUser } = await supabase.from('queue').select('*').limit(1).maybeSingle();

        if (waitingUser) {
            await supabase.from('queue').delete().eq('discord_id', waitingUser.discord_id);
            const sharedThread = client.channels.cache.get(waitingUser.thread_id) as ThreadChannel;
            
            if (sharedThread) {
                await sharedThread.members.add(userId);
                await supabase.from('active_chats').insert({
                    user1_id: waitingUser.discord_id, user1_thread_id: sharedThread.id,
                    user2_id: userId, user2_thread_id: sharedThread.id
                });
                await sharedThread.send(`Hey 👋 <@${waitingUser.discord_id}> and <@${userId}> you've been matched! Start chatting here. 💬`);
                return interaction.editReply(`Match found! Jump in: <#${sharedThread.id}>`);
            }
        } else {
            const thread = await channel.threads.create({ name: `Your Chat`, type: ChannelType.PrivateThread });
            await thread.members.add(userId);
            await supabase.from('queue').insert({ discord_id: userId, thread_id: thread.id });
            await thread.send(`Hey 👋 <@${userId}> please wait, looking for a match... 👀`);
            return interaction.editReply(`Joined queue! Wait here: <#${thread.id}>`);
        }
    }
});

// 6. ANTI-SLEEP WEB SERVER
const express = require('express');
const server = express();
server.get('/', (req: any, res: any) => res.send('Matchbot is alive!'));
server.listen(process.env.PORT || 3000, () => console.log('🌐 Web server is running!'));