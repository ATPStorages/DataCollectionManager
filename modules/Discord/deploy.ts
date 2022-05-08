import { RESTPostAPIApplicationCommandsJSONBody, RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord-api-types/v10";
import { isMainThread, parentPort, workerData } from 'worker_threads';
import { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "@discordjs/builders";
import { Routes } from "discord-api-types/v9";
import { fileURLToPath } from "node:url";
import { REST } from "@discordjs/rest";
import { Client } from "discord.js";
import fs from "node:fs/promises";
import chalk from "chalk";
import debug from "debug";

const DepOut = debug((isMainThread ? "Discord" : workerData.debuggerName) + "/Deploy");
const rest = new REST().setToken(process.env.token!);

type EventExecution = (client: Client, ...otherRequests: any) => any;
type CommandExecution = (client: Client, ...otherRequests: any) => any;
export interface CommandObject { name: string, disabled: boolean, slashCommand: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder, execute: CommandExecution };
export interface EventObject { name: string, disabled: boolean, initialize: CommandExecution };

export type ExtendedClient = Client & { commands?: Map<String, Command>, events?: Map<String, Event> };

export class Command { 
    public name: string;
    public disabled: boolean;
    public slashCommand: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    public execute: CommandExecution;

    constructor(name: string, disabled: boolean, slashCommand: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder, execute: CommandExecution) {
        this.name = name;
        if(disabled) this.disabled = true;
        else this.disabled = false;
        this.slashCommand = slashCommand;
        this.execute = execute;
    }
};

export class Event { 
    public name: string;
    public disabled: boolean;
    public initialize: EventExecution;

    constructor(name: string, disabled: boolean, initialize: EventExecution) {
        this.name = name;
        if(disabled) this.disabled = true;
        else this.disabled = false;
        this.initialize = initialize;
    }
}

/** @internal */
export function isCommmandObj(obj: any): obj is CommandObject { return "name" in obj && "disabled" in obj && "slashCommand" in obj && "execute" in obj; }
export function JSONToCommand(command: CommandObject): Command { return new Command(command.name, command.disabled, command.slashCommand, command.execute); }
/** @internal */
export function isEventObj(obj: any): obj is EventObject { return "name" in obj && "disabled" in obj && "initialize" in obj; }
export function JSONToEvent(command: EventObject): Event { return new Event(command.name, command.disabled, command.initialize); }

type deployResult = Promise<{ length: number, global: boolean, returned: unknown }>;
export function deploy(clientId: string, commands: RESTPostAPIApplicationCommandsJSONBody[]): deployResult
export function deploy(clientId: string, commands: RESTPostAPIApplicationCommandsJSONBody[], guildId: string): deployResult
export function deploy(clientId: string, commands: RESTPostAPIApplicationCommandsJSONBody[], guildId?: string): deployResult{
    return new Promise(async(resolve, reject) => {
        if(!clientId) reject(new Error('No client ID provided.'));
        let ret;

        if(guildId) { ret = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands }).catch(reject); } 
        else ret = await rest.put(Routes.applicationCommands(clientId), { body: commands }).catch(reject);

        if(ret instanceof Array) resolve({ length: ret.length, global: true, returned: ret });
        else throw new Error(typeof ret);
    });
}

const commandsDirectory = fileURLToPath(import.meta.url) + "/../commands";
export function initializeCommands(client: ExtendedClient): Promise<{ commands: Map<String, Command>, slashCommands: { json: RESTPostAPIApplicationCommandsJSONBody[], builders: SlashCommandBuilder[] } }> {
    return new Promise((resolve, reject) => {
        client["commands"] = new Map<String, Command>();
        fs.readdir(commandsDirectory, { withFileTypes: true }).then(async entries => {
            let builderArray: SlashCommandBuilder[] = []
            for(const entry of entries) {
                if(entry.isFile() && entry.name.endsWith(".js") || entry.name.endsWith(".mjs") || entry.name.endsWith(".cjs")) {
                    let command = await import(`file://${commandsDirectory}/${entry.name}`);
                    if(command.default) {
                        command = command.default;
                        if(isCommmandObj(command)) {
                            builderArray.push(command.slashCommand as SlashCommandBuilder);
                            client.commands!.set(command.name, JSONToCommand(command));
                            DepOut(chalk.green`+ Added command [ {white ${entry.name}} / {white ${command.name}} ]. (Total commands: {white ${client.commands!.size}}${command.disabled ? ` / {yellow Disabled}` : ""})`);
                        } else {
                            DepOut(chalk.red`✕ Entry {white ${entry.name}} is not a valid command object.`);
                        }
                    }
                }
            }
            
            resolve({ commands: client.commands!, slashCommands: { json: (builderArray.map(command => command.toJSON()) as RESTPostAPIApplicationCommandsJSONBody[]), builders: builderArray } });
        }).catch(err => {
            reject(chalk.red`Couldn't read commands directory.\n=> ${err.name}: {white ${err.message}}\n->${err.stack}`);
        });
    });
}

export default { deploy, initializeCommands, Event, Command, JSONToCommand, JSONToEvent };