const { Client, Partials, PermissionFlagsBits, Events, EmbedBuilder, ChannelType, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField } = require("discord.js");
const client = new Client({ intents: 131071, partials: Object.values(Partials).filter((x) => typeof x === "string"), shards: "auto" });

require("./src/handlers/commandHandler.js")(client);
const config = require("./config.js");

const { QuickDB } = require("quick.db");
const db = new QuickDB();
client.db = db;

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.guild.id !== config.system.system_guild_id) return;

    if (interaction.isButton()) {
        if (interaction.customId === "ticket-create") {
            await interaction.deferReply({ ephemeral: true });

            const existingTicketId = await db.get(`database.user.${interaction.user.id}.ticket.id`);
            if (existingTicketId) {
                return interaction.editReply({ content: `You already have a ticket. (<#${existingTicketId}>)`, ephemeral: true });
            }

            const ticketCount = (await db.get(`database.guild.${interaction.guild.id}.tickets.count`) || 0) + 1;
            const channelName = `ticket-${ticketCount.toString().padStart(4, '0')}`;

            try {
                const channel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: config.system.system_parent_id,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: interaction.user.id,
                            allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.AttachFiles]
                        },
                        ...config.system.system_staff_roles_ids.map(roleId => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }))
                    ]
                });

                await db.set(`database.guild.${interaction.guild.id}.tickets.count`, ticketCount);
                await db.set(`database.user.${interaction.user.id}.ticket.id`, channel.id);

                const embed = new EmbedBuilder()
                    .setColor("#2b2d31")
                    .setAuthor({ name: `${interaction.guild.name} - Support System`, iconURL: interaction.guild.iconURL() })
                    .setDescription(`Welcome! Our staff will assist you shortly.`)
                    .setFooter({ text: interaction.user.username, iconURL: interaction.user.avatarURL() })
                    .setTimestamp();

                const closeButton = new ButtonBuilder()
                    .setCustomId("ticket-close")
                    .setLabel("Close Ticket")
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(closeButton);

                const message = await channel.send({ content: `${interaction.user} ||${interaction.guild.roles.everyone}||`, embeds: [embed], components: [row] });

                await db.set(`database.guild.${interaction.guild.id}.tickets.${channel.id}`, { user: interaction.user.id, staff: null, status: "active", message: message.id });
                await interaction.editReply({ content: `Your support ticket has been successfully created. (${channel})`, ephemeral: true });

            } catch (error) {
                console.error("Error creating ticket:", error);
                await interaction.editReply({ content: "There was an error creating the support ticket.", ephemeral: true });
            }

        } else if (interaction.customId === "ticket-close") {
            await interaction.deferReply();

            const user = await db.get(`database.guild.${interaction.guild.id}.tickets.${interaction.channel.id}.user`);
            const staff = await db.get(`database.guild.${interaction.guild.id}.tickets.${interaction.channel.id}.staff`);
            const status = await db.get(`database.guild.${interaction.guild.id}.tickets.${interaction.channel.id}.status`);
            const msgid = await db.get(`database.guild.${interaction.guild.id}.tickets.${interaction.channel.id}.message`);
            const message = await interaction.channel.messages.fetch(msgid);

            if (status === "active") {
                const button = ButtonBuilder.from(message.components[0].components[0]).setDisabled(true);
                await message.edit({ components: [new ActionRowBuilder().addComponents(button)] });

                const confirmButton = new ButtonBuilder()
                    .setCustomId("ticket-close-confirm")
                    .setLabel("Yes")
                    .setStyle(ButtonStyle.Success);

                const cancelButton = new ButtonBuilder()
                    .setCustomId("ticket-close-cancel")
                    .setLabel("No")
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

                const confirmationMessage = await interaction.editReply({ content: `Are you sure you want to close this ticket?`, components: [row] });

                const collector = confirmationMessage.createMessageComponentCollector({ time: 600000 });

                collector.on("collect", async (collected) => {
                    if (collected.customId === "ticket-close-confirm") {
                        await collected.deferUpdate();
                        await collected.message.edit({ content: `This ticket will be closed <t:${Math.floor((Date.now() + 5000) / 1000)}:R>.`, components: [] });

                        setTimeout(async () => {
                            const deleteButton = new ButtonBuilder()
                                .setCustomId("ticket-close-delete")
                                .setLabel("Delete Ticket")
                                .setStyle(ButtonStyle.Secondary);

                            const row = new ActionRowBuilder().addComponents(deleteButton);

                            await db.set(`database.user.${user}.ticket.id`, null);
                            await db.set(`database.guild.${interaction.guild.id}.tickets.${interaction.channel.id}`, { user: user, staff: staff, status: "inactive", message: msgid });

                            await collected.message.edit({ content: `This ticket has been closed by ${collected.user}.`, components: [row] });

                            await interaction.channel.permissionOverwrites.edit(user, {
                                [PermissionsBitField.Flags.ViewChannel]: false
                            });
                        }, 5000);
                    }

                    if (collected.customId === "ticket-close-cancel") {
                        await collected.deferUpdate();
                        await collected.message.delete();

                        const button = ButtonBuilder.from(message.components[0].components[0]).setDisabled(false);
                        await message.edit({ components: [new ActionRowBuilder().addComponents(button)] });
                    }
                });

                collector.on("end", async (collected) => {
                    if (collected.size === 0) {
                        const button = ButtonBuilder.from(message.components[0].components[0]).setDisabled(false);
                        await message.edit({ components: [new ActionRowBuilder().addComponents(button)] });
                        try {
                            await confirmationMessage.delete();
                        } catch (e) {
                            return;
                        }
                    }
                });
            } else {
                return interaction.editReply({ content: `This ticket is already closed.`, ephemeral: true });
            }
        } else if (interaction.customId === "ticket-close-delete") {
            await interaction.deferUpdate();

            await interaction.message.edit({ content: `This ticket will be deleted <t:${Math.floor((Date.now() + 5000) / 1000)}:R>.`, components: [] });

            setTimeout(async () => {
                await db.delete(`database.guild.${interaction.guild.id}.tickets.${interaction.channel.id}`);
                await interaction.channel.delete();
            }, 5000);
        }
    }
});
client.login(config.client.bot_token);