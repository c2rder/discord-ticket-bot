const { EmbedBuilder, SlashCommandBuilder, Client, ChatInputCommandInteraction, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

const config = require("../../config.js");

module.exports = {
    slash: true,
    data: new SlashCommandBuilder()
        .setName("system")
        .setDescription("Made by c2rder.")
        .setDMPermission(false),
    /**
     * @param {Client} client
     * @param {ChatInputCommandInteraction} interaction
     */
    async execute(client, interaction) {
        if (interaction.user.id !== config.client.bot_owner_id) {
            return interaction.reply({ content: "Only the developer can use this command.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor("#2b2d31")
            .setAuthor({ name: `${interaction.guild.name} - Support System`, iconURL: interaction.guild.iconURL() })
            .setDescription("Click the button below to make a purchase or ask a question.")
            .setFooter({ text: interaction.user.username, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId("ticket-create")
            .setDisabled(false)
            .setEmoji("🎫")
            .setLabel("Create Support Ticket")
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({ content: "Made by c2rder.", ephemeral: true });
        await interaction.deleteReply();

        await interaction.channel.send({ embeds: [embed], components: [row] });
    },
};