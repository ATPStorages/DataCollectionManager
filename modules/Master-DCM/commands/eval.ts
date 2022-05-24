import { SlashCommandBooleanOption, SlashCommandBuilder, SlashCommandStringOption } from "@discordjs/builders";
import { CommandObject } from "../deploy.js";
import { MessageEmbed } from "discord.js";
import { writeFile } from "fs/promises";
import typescript from "ts-node";

let TSService!: typescript.Service;
const command: CommandObject = {
    name: "eval",
    disabled: false,
    slashCommand: 
        new SlashCommandBuilder()
            .setName("eval")
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("script")
                    .setDescription("The script to evaluate.")
                    .setRequired(true)
            )
            .addBooleanOption(
                new SlashCommandBooleanOption()
                    .setName("runas_module")
                    .setDescription("To run as a module or not. Required if code needs imports.")
                    .setRequired(true)
            )
            .addStringOption(
                new SlashCommandStringOption()
                    .setName("file_name")
                    .setDescription("What to save the file as.")
            )
            .setDescription("Evaluates a string of TS/JS code. Generally used for database modification. Developer only."),
    execute: async function (client, interaction, advConfig) {
        if(interaction.user.id === process.env.owner) {
            if(!TSService) TSService = typescript.create(advConfig.TSRuntime);
            await interaction.deferReply({ ephemeral: true });

            const compileST = process.hrtime.bigint();
            const fileName = (interaction.options.getString("file_name") ? interaction.options.getString("file_name") + "-" : "") + Date.now(), script = interaction.options.getString("script")!;
            let uFileLoc: any = `${client.dataDir}/evalFiles/raw/${fileName}.ts`
            let cFileLoc: any = `${client.dataDir}/evalFiles/compiled/${fileName}.js`
            await writeFile(uFileLoc, script!).catch(err => { uFileLoc = err; });

            let code: any;
            try { code = TSService.compile(script!, uFileLoc); } catch(e) { code = e; }
            await writeFile(cFileLoc, code).catch(err => { cFileLoc = err; });
            const compileET = process.hrtime.bigint();

            let result;
            const execST = process.hrtime.bigint();
            try { if(code instanceof Error) { throw code; } else result = await eval(code); } catch(e: any) { result = `${e.name}: ${e.message}\n\n${e.stack}`; }

            interaction.editReply({ embeds: [ new MessageEmbed()
                .setDescription(`Compiled in \`${compileET-compileST}\` ns\n${code instanceof Error ? "Could not execute code; compilation error" : `Executed in \`${process.hrtime.bigint()-execST}\` ns`}\n\`\`\`js\n${result}\n\`\`\`\n${uFileLoc instanceof Error ? `Couldn't save original code:\n\`${uFileLoc.name}: ${uFileLoc.message}\`` : `Original code saved at \`${uFileLoc}\``}\n\n${cFileLoc instanceof Error ? `Couldn't save compiled code:\n\`${cFileLoc.name}: ${cFileLoc.message}\`` : `Compiled code saved at \`${cFileLoc}\``}`)
                .setColor(0xEB5A00)
            ] });
        }
    }
}

export default command;