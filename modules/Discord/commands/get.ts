import { SlashCommandBooleanOption, SlashCommandBuilder, SlashCommandStringOption, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder, SlashCommandUserOption } from "@discordjs/builders";
import { ExtendedClient, CommandObject } from "../deploy";
import { CommandInteraction, Message, MessageAttachment, MessagePayload } from "discord.js";
import { Records, Stats } from "../index.js";
import humanize from "humanize-duration";
import embeds from "../embeds.js";
import Enmap from "enmap";
import xlsx from "xlsx";

const TimerStore = new Enmap("TimerStore");

const command: CommandObject = {
    name: "get",
    disabled: false,
    slashCommand: 
        new SlashCommandBuilder()
            .setName("get")
            .addSubcommandGroup(
                new SlashCommandSubcommandGroupBuilder()
                    .setName("records")
                    .setDescription("Interface for accessing DCM records.")
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("messages")
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .addChoice("Comma Separated Values (.csv)", "csv")
                                    .addChoice("UTF-16 Unicode Text (.txt)", "txt")
                                    .addChoice("JavaScript Object Notation (.json)", "json")
                                    .addChoice("Excel XML Format (.xlsx)", "xlsx")
                                    .addChoice("Web Document (.html)", "html")
                                    .addChoice("Data Interchange Format (.dif)", "dif")
                                    .addChoice("Ethercalc Record Format (.eth)", "eth")
                                    .addChoice("Rich Text Format (.rtf)", "rtf")
                                    .addChoice("OpenDocument Spreadsheet (.ods)", "ods")
                
                                    .setName("format")
                                    .setRequired(true)
                                    .setDescription("The format of the spreadsheet to export.")
                            )
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .addChoice("Hourly", "hour")
                                    .addChoice("Daily", "day")
                                    .addChoice("Weekly", "week")
                                    .addChoice("Monthly", "month")
                                    .addChoice("All time", "all")
                
                                    .setName("range")
                                    .setRequired(true)
                                    .setDescription("Where to get data.")
                            )
                            .setDescription("Gets a spreadsheet containing collected announcements."),
                    )
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("embeds")
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setDescription("The Embeds Reference UUID to get.")
                                    .setRequired(true)
                                    .setName("uuid")
                            )
                            .setDescription("Gets embeds contained in an announcement, by their Embeds Reference UUID."),
                    )
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("attachments")
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setDescription("The Attachments Reference UUID to get.")
                                    .setRequired(true)
                                    .setName("uuid")
                            )
                            .setDescription("Gets attachments contained in an announcement, by their Attachments Reference UUID."),
                    )
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("stickers")
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setDescription("The Stickers Reference UUID to get.")
                                    .setRequired(true)
                                    .setName("uuid")
                            )
                            .setDescription("Gets stickers contained in an announcement, by their Stickers Reference UUID."),
                    )
                    .addSubcommand(
                        new SlashCommandSubcommandBuilder()
                            .setName("announcement")
                            .addStringOption(
                                new SlashCommandStringOption()
                                    .setDescription("The announcement ID to get.")
                                    .setRequired(true)
                                    .setName("id")
                            )
                            .addBooleanOption(
                                new SlashCommandBooleanOption()
                                    .setDescription("Wether to get the announcement JSON body or a visual construct of it.")
                                    .setRequired(true)
                                    .setName("json")
                            )
                            .setDescription("Constructs what an announcement looked like at it's time of crossposting."),
                    )
            )
            .addSubcommand(
                new SlashCommandSubcommandBuilder()
                    .setName("status")
                    .setDescription("Checks when the next record will be sent in daily/weekly/monthly."),
            )
            .setDescription("User interface for accessing DCM records."),
    execute: function (client: ExtendedClient, interaction: CommandInteraction, data: { records: Records, stats: Stats }) {
        const open = interaction.channelId === "961293787995451402" ? false : true;
        switch(interaction.options.getSubcommand()) {
            case "messages":
                const range = interaction.options.getString("range");
                const loc = Object.values(range === "all" ? data.records.messages.total : range === "hour" ? data.records.messages.hour : range === "day" ? data.records.messages.day : range === "week" ? data.records.messages.week : range === "month" ? data.records.messages.month : data.records.messages.total);

                if(loc.length > 0) {
                    const format = interaction.options.getString("format");
        
                    try {
                        let data;
                        if(format !== "json") {
                            const workbook = xlsx.utils.book_new();
                            const jsonWorkSheet = xlsx.utils.json_to_sheet(loc);
                            xlsx.utils.book_append_sheet(workbook, jsonWorkSheet, "Announcements");
                            data = xlsx.write(workbook, { type: "buffer", bookType: (format as xlsx.BookType) });
                        } else {
                            data = JSON.stringify(loc);
                        }
        
                        interaction.reply({ ephemeral: open, embeds: [ embeds.info(`Exported **${loc.length}** announcement${loc.length === 1 ? "" : "s"}.`) ], files: [{ 
                            attachment: Buffer.from(data),  
                            name: `Announcements${Date.now()}.${format}`,
                            description: "Document containing all collected announcements from DCM."
                        }]});
                    } catch(err) {
                        interaction.reply({ ephemeral: open, embeds: [ embeds.error("```js\n" + err + "```\nThis has been reported.", `Spreadsheet (.${format}) Export Error`) ] });
                    }
                } else interaction.reply({ ephemeral: open, embeds: [ embeds.error("There are no announcements to export.") ] });
                break;
            case "embeds":
                const euuid = interaction.options.getString("uuid")!.trim(), rembeds = data.records.embeds.total[euuid]
                if(!!euuid && rembeds) interaction.reply({ embeds: rembeds, content: `UUID \`${euuid}\` referenced **${rembeds.length}** embed${rembeds.length === 1 ? "" : "s"}:`, ephemeral: open });
                else interaction.reply({ ephemeral: open, embeds: [ embeds.error("The specified embeds ref. UUID does not exist.") ] });
                break;
            case "attachments":
                const fuuid = interaction.options.getString("uuid")!.trim(), fatt = data.records.attachments.total[fuuid]
                if(!!fuuid && fatt) {
                    let composite = "```";
                    fatt.forEach(attachment => composite += `\n${attachment.name ? attachment.name + ":" : "" || "unknown / no name defined:"}\n\tID  : ${attachment.id}\n\tSplr: ${attachment.spoiler ? "Yes": "No"}\n\tURI : ${attachment.url}\n\tpURI: ${attachment.proxyURL}\n\tSize: ${attachment.size} bytes\n\tType: ${attachment.contentType}\n\tDesc: ${attachment.description || "unknown / no description"}\n`);
                    interaction.reply({ content: `UUID \`${fuuid}\` referenced **${fatt.length}** attachment${fatt.length === 1 ? "" : "s"}: ${composite}\`\`\``, ephemeral: open });
                } else interaction.reply({ ephemeral: open, embeds: [ embeds.error("The specified attachments ref. UUID does not exist.") ] });
                break;
            case "stickers":
                const suuid = interaction.options.getString("uuid")!.trim(), sstc = data.records.stickers.total[suuid]
                if(!!suuid && sstc) {
                    let composite = "```";
                    sstc.forEach(sticker => composite += `\n${sticker.name + ":"}\n\tID    : ${sticker.id}\n\tURI   : ${sticker.url}\n\tServer: ${sticker.guild ? `\n\t\tName: ${sticker.guild.name}\n\t\tID  : ${sticker.guildId}\n\t\tCrtr: ${sticker.user!.tag} (${sticker.user!.id}) ` : "Discord"}\n\tType  : ${sticker.type ? sticker.type === "STANDARD" ? `standard (${sticker.packId})` : sticker.type.toLowerCase() : "unknown"}\n\tDesc  : ${sticker.description || "unknown / no description"}\n\tFormat: ${"." + sticker.format.toLowerCase()}${sticker.tags ? `\n\tTags  : ${sticker.tags.join(", ")}`: ""}\n`);
                    interaction.reply({ content: `UUID \`${suuid}\` referenced **${sstc.length}** sticker${sstc.length === 1 ? "" : "s"}: ${composite}\`\`\``, ephemeral: open });
                } else interaction.reply({ ephemeral: open, embeds: [ embeds.error("The specified stickers ref. UUID does not exist.") ] });
                break;
            case "announcement":
                const mid = interaction.options.getString("id")!.trim(), acnt = data.records.messages.total[mid] || data.records.messages.total[data.records.messages.anmMap[interaction.options.getString("id")!.trim()]];
                if(!!mid && acnt) {
                    const json = interaction.options.getBoolean("json");
                    if(json) {
                        const announcement = new MessagePayload(interaction, { content: acnt.Content, embeds: data.records.embeds.total[acnt["Embeds Reference UUID"]], files: data.records.attachments.total[acnt["Attachments Reference UUID"]], stickers: data.records.stickers.total[acnt["Stickers Reference UUID"]] });
                        interaction.reply({ content: `ID \`${mid}\` referenced announcement \`${acnt["Message ID"]}\` in **${acnt.Channel}** (**${acnt["Channel ID"]}**), **${acnt.Server}** (**${acnt["Server ID"]}**)`, ephemeral: open, files: [ new MessageAttachment(Buffer.from(JSON.stringify(announcement.options, null, "\t")), `${acnt["Server ID"]}-${acnt["Message ID"]}.json`) ] });
                    } else {
                        interaction.reply({ content: acnt.Content, embeds: data.records.embeds.total[acnt["Embeds Reference UUID"]], files: data.records.attachments.total[acnt["Attachments Reference UUID"]], ephemeral: open });
                    }
                } else interaction.reply({ ephemeral: open, embeds: [ embeds.error("The specified announcement ID does not exist.") ] });
                break;
            case "status":
                const ms = TimerStore.fetch("delayProg");
                interaction.reply({ embeds: [
                    embeds.info(`Announcements Stored: [ All: **${data.stats.messages.total}** | Cur. Hour: **${data.stats.messages.hour}** / Cur. Day: **${data.stats.messages.day}** / Cur. Week: **${data.stats.messages.week}** / Cur. Month: **${data.stats.messages.month}** ]\nStickers Stored: [ All: **${data.stats.stickers.total}** | Cur. Hour: **${data.stats.stickers.hour}** / Cur. Day: **${data.stats.stickers.day}** / Cur. Week: **${data.stats.stickers.week}** / Cur. Month: **${data.stats.stickers.month}** ]\nAttachments Stored: [ All: **${data.stats.attachments.total}** | Cur. Hour: **${data.stats.attachments.hour}** / Cur. Day: **${data.stats.attachments.day}** / Cur. Week: **${data.stats.attachments.week}** / Cur. Month: **${data.stats.attachments.month}** ]\nEmbeds Stored: [ All: **${data.stats.embeds.total}** | Cur. Hour: **${data.stats.embeds.hour}** / Cur. Day: **${data.stats.embeds.day}** / Cur. Week: **${data.stats.embeds.week}** / Cur. Month: **${data.stats.embeds.month}** ]\nUnique Servers: [ All: **${data.stats.servers.total.length}** | Cur. Hour: **${data.stats.servers.hour.length}** / Cur. Day: **${data.stats.servers.day.length}** / Cur. Week: **${data.stats.servers.week.length}** / Cur. Month: **${data.stats.servers.month.length}** ]\n\nNext **hourly** post: **${humanize(ms.hour, { round: true })}** (**${ms.hour}**)\nNext **daily** post: **${humanize(ms.day, { round: true })}** (**${ms.day}**)\nNext **weekly** post: **${humanize(ms.week, { round: true })}** (**${ms.week}**)\nNext **monthly** post: **${humanize(ms.month, { round: true })}** (**${ms.month}**)`)
                ], ephemeral: open });
                break;
        }
    }
}

export default command;