import { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction, ChannelType 
} from 'discord.js';
import * as express from 'express'; // Fixed Import
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
        if (clientId && token) {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            console.log('✅ Slash Commands Synced.');
        }
    } catch (e) {
        console.error('❌ CMD SYNC ERROR:', e);
    }
}

// --- 4. MATCHING LOGIC ---
client.on('interactionCreate', async (interaction: Interaction) => {
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

    if (interaction.isButton() && interaction.customId === 'join_queue') {
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.user.id;

        // 1. Check if you are already in the queue
        const { data: alreadyIn } = await supabase.from('queue').select('*').eq('user_id', userId).maybeSingle();
        if (alreadyIn) return interaction.editReply("You are already in the queue! Please wait for a match.");

        // 2. Look for an opponent (someone who is NOT you)
        const { data: opponent } = await supabase
            .from('queue')
            .select('*')
            .neq('user_id', userId) // Don't match with yourself
            .limit(1)
            .maybeSingle();

        if (opponent) {
            // MATCH FOUND! Remove opponent from queue
            await supabase.from('queue').delete().eq('user_id', opponent.user_id);

            if (interaction.channel?.type === ChannelType.GuildText) {
                const thread = await interaction.channel.threads.create({
                    name: `Chat: Match Found`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PrivateThread, // Make it private if boosted, otherwise stays public
                });

                await thread.members.add(userId);
                await thread.members.add(opponent.user_id);
                await thread.send(`👋 **Match Found!** <@${userId}> and <@${opponent.user_id}>, you can now chat here.`);
                
                await interaction.editReply("Successfully matched! I have created a thread for you.");
            } else {
                await interaction.editReply("I can only create chat threads in a standard text channel.");
            }
        } else {
            // NO MATCH: Add you to the queue
            await supabase.from('queue').insert([{ user_id: userId }]);
            await interaction.editReply("Waiting for a partner... I will notify you in a thread once a match is found!");
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