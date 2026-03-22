import { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction, ChannelType 
} from 'discord.js';
import express from 'express';
import { supabase } from './supabase';

// --- 1. RENDER PORT BINDING ---
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Matchbot is running and healthy!'));
app.listen(port, () => console.log(`✅ Web server listening on port ${port}`));

// --- 2. BOT CONFIG ---
const token = process.env.DISCORD_TOKEN?.trim();
const clientId = process.env.CLIENT_ID?.trim();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// --- 3. SLASH COMMANDS REGISTRATION ---
const commands = [
    new SlashCommandBuilder().setName('setup').setDescription('Admin: Creates the join button.'),
    new SlashCommandBuilder().setName('leave').setDescription('Leave the current chat or queue.')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token!);

async function refreshCommands() {
    try {
        if (clientId) {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            console.log('✅ Slash Commands Synced.');
        }
    } catch (e) {
        console.error('❌ CMD SYNC ERROR:', e);
    }
}

// --- 4. MATCHING LOGIC ---
client.on('interactionCreate', async (interaction: Interaction) => {
    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup') {
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('join_queue')
                    .setLabel('💬 Chat with a Stranger')
                    .setStyle(ButtonStyle.Primary)
            );
            await interaction.reply({ content: '**Welcome to Strangers Chat!** Click below to find a match.', components: [row] });
        }
        return;
    }

    // Handle Button Clicks
    if (interaction.isButton() && interaction.customId === 'join_queue') {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;

        // 1. Check if user is already in queue
        const { data: alreadyIn } = await supabase.from('queue').select('*').eq('user_id', userId).maybeSingle();
        if (alreadyIn) return interaction.editReply("You are already in the queue!");

        // 2. Look for a match
        const { data: opponent } = await supabase.from('queue').select('*').limit(1).maybeSingle();

        if (opponent && opponent.user_id !== userId) {
            // MATCH FOUND!
            // Remove opponent from queue
            await supabase.from('queue').delete().eq('user_id', opponent.user_id);

            // Create a Private Thread (if in a Text Channel)
            if (interaction.channel?.type === ChannelType.GuildText) {
                const thread = await interaction.channel.threads.create({
                    name: `Chat: ${interaction.user.username} & Someone`,
                    autoArchiveDuration: 60,
                    reason: 'Stranger Match',
                });

                await thread.members.add(userId);
                await thread.members.add(opponent.user_id);
                await thread.send(`👋 **Match Found!** <@${userId}> and <@${opponent.user_id}>, you can now chat here privately.`);
                
                await interaction.editReply("Successfully matched! Check the new thread.");
            }
        } else {
            // NO MATCH: Add to queue
            await supabase.from('queue').insert([{ user_id: userId }]);
            await interaction.editReply("Waiting for a partner... You'll be notified when someone joins!");
        }
    }
});

// --- 5. STARTUP ---
async function start() {
    if (!token) return console.error("❌ MISSING DISCORD_TOKEN");

    try {
        console.log("⏳ Connecting to Discord...");
        await client.login(token);
        await refreshCommands();
    } catch (err: any) {
        if (err.message.includes('429')) {
            console.warn("⚠️ Rate limited. Retrying in 60s...");
            setTimeout(start, 60000);
        } else {
            console.error("❌ Login failed:", err);
        }
    }
}

client.once('ready', () => console.log(`🚀 ${client.user?.tag} is online!`));

start();