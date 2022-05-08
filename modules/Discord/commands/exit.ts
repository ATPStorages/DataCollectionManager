import { SlashCommandBooleanOption, SlashCommandBuilder } from "@discordjs/builders";
import { ExtendedClient, CommandObject } from "../deploy";
import { parentPort } from "node:worker_threads";
import { CommandInteraction } from "discord.js";

const command: CommandObject = {
    name: "exit",
    disabled: false,
    slashCommand: 
        new SlashCommandBuilder()
            .setName("exit")
            .addBooleanOption(
                new SlashCommandBooleanOption()
                    .setName("all")
                    .setRequired(true)
                    .setDescription("Kills the DCM Manager Process (and all workers running)")
            )
            .setDescription("Terminates the worker process."),
    execute: async function (client: ExtendedClient, interaction: CommandInteraction) {
        if(interaction.user.id === process.env.owner) {
            if(interaction.options.getBoolean("all")) {
                await interaction.reply({ ephemeral: true, content: "Issuing abort command..." });
                parentPort!.postMessage("exitAll");
            } else {
                await interaction.reply({ ephemeral: true, content: "Terminating..." });
                client.destroy();
                process.exit(5);
            }
        }
    }
}

export default command;