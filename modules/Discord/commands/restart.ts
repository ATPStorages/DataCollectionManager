import { ExtendedClient, CommandObject } from "../deploy.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import { parentPort } from "node:worker_threads";
import { CommandInteraction } from "discord.js";

const command: CommandObject = {
    name: "restart",
    disabled: false,
    slashCommand: 
        new SlashCommandBuilder()
            .setName("restart")
            .setDescription("Requests the Manager to restart the worker."),
    execute: async function (client: ExtendedClient, interaction: CommandInteraction) {
        if(interaction.user.id === process.env.owner) {
            await interaction.reply({ ephemeral: true, content: "Restarting..." });
            parentPort?.postMessage("restart");
        }
    }
}

export default command;