import { ExtendedClient, CommandObject } from "../deploy.js";
import { SlashCommandBuilder } from "@discordjs/builders";
import { parentPort } from "node:worker_threads";
import { CommandInteraction } from "discord.js";
import Enmap from "enmap";

const TimerStore = new Enmap("TimerStore");

const command: CommandObject = {
    name: "reset",
    disabled: false,
    slashCommand: 
        new SlashCommandBuilder()
            .setName("reset")
            .setDescription("Deletes the persistent timer database. This will cause all stored media to be erased."),
    execute: async function (client: ExtendedClient, interaction: CommandInteraction) {
        if(interaction.user.id === process.env.owner) {
            TimerStore.clear();
            await interaction.reply({ ephemeral: true, content: "Database deleted. Restarting..." });
            parentPort?.postMessage("restart");
        }
    }
}

export default command;