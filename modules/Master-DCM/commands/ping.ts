import { SlashCommandBuilder } from "@discordjs/builders";
import { ExtendedClient, CommandObject } from "../deploy";
import { CommandInteraction } from "discord.js";
import { info } from "../embeds.js";

const command: CommandObject = {
    name: "ping",
    disabled: false,
    slashCommand: 
        new SlashCommandBuilder()
            .setName("ping")
            .setDescription("Gets current server latency."),
    execute: function (client: ExtendedClient, interaction: CommandInteraction) {
        const open = interaction.channelId === "961293787995451402" ? false : true;
        interaction.reply({ ephemeral: open, embeds: [ info(`**Local Latency**: **${Date.now() - interaction.createdTimestamp}**ms\n**Socket Latency**: **${client.ws.ping}**ms`) ] })
    }
}

export default command;