import { Client, Intents, Message, MessageAttachment, MessageEmbed, NewsChannel, Snowflake, Sticker, TextChannel } from 'discord.js';
import { ExtendedClient, initializeCommands, deploy } from "./deploy.js";
import { isMainThread, parentPort, workerData } from 'worker_threads';
import { join, dirname, basename } from "node:path";
import { createWriteStream } from 'node:fs';
import humanize from "humanize-duration";
import { fileURLToPath } from 'node:url';
import { randomUUID } from "node:crypto";
import { totalmem } from "node:os";
import embeds from "./embeds.js";
import fetch from "node-fetch";
import chalk from "chalk";
import Enmap from "enmap";
import debug from "debug";
import xlsx from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TimerStore = new Enmap("TimerStore");
const DBMain = debug((isMainThread ? "Discord" : workerData.debuggerName) + "/Main");
const client: ExtendedClient = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
const { green, yellow, blueBright, red } = chalk;
// // //
export type Stats = {
    messages: { total: number, hour: number, day: number, week: number, month: number }, 
    attachments: { total: number, hour: number, day: number, week: number, month: number }, 
    embeds: { total: number, hour: number, day: number, week: number, month: number }, 
    stickers: { total: number, hour: number, day: number, week: number, month: number }, 
    servers: { total: string[], hour: string[], day: string[], week: string[], month: string[] } 
};

export type Records = { 
    messages: {
        total: { [key: Snowflake]: Announcement }, 
        hour: { [key: Snowflake]: Announcement }, 
        day: { [key: Snowflake]: Announcement },
        week: { [key: Snowflake]: Announcement }, 
        month: { [key: Snowflake]: Announcement },
        anmMap: { [key: string]: Snowflake }
    }, 
    attachments: {
        total: { [key: string]: MessageAttachment[] }, 
        hour: { [key: string]: MessageAttachment[] }, 
        day: { [key: string]: MessageAttachment[] },
        week: { [key: string]: MessageAttachment[] }, 
        month: { [key: string]: MessageAttachment[] }
    },
    embeds: {
        total: { [key: string]: MessageEmbed[] }, 
        hour: { [key: string]: MessageEmbed[] }, 
        day: { [key: string]: MessageEmbed[] },
        week: { [key: string]: MessageEmbed[] }, 
        month: { [key: string]: MessageEmbed[] } 
    },
    stickers: {
        total: { [key: string]: Sticker[] }, 
        hour: { [key: string]: Sticker[] }, 
        day: { [key: string]: Sticker[] },
        week: { [key: string]: Sticker[] }, 
        month: { [key: string]: Sticker[] } 
    }
};

export type Announcement = {
    Time: string, 
    Server: string, 
    Channel: string, 
    "Server ID": Snowflake,
    "Channel ID": Snowflake,
    "Message ID": Snowflake,
    "Announcement ID": Snowflake,
    "Content": string,
    "Clean Content": string,
    "Message Link (SGIV)": string,
    "Message Link (Srce)": string,
    "Embeds Reference UUID": string,
    "Attachments Reference UUID": string,
    "Stickers Reference UUID": string,
    [key: string]: any;
}

let records: Records = TimerStore.ensure("records", {
    messages: {
        total: {},
        hour: {},
        day: {},
        week: {},
        month: {},
        anmMap: {}
    },
    embeds: {
        total: {},
        hour: {},
        day: {},
        week: {},
        month: {}
    },
    attachments: {
        total: {},
        hour: {},
        day: {},
        week: {},
        month: {}
    },
    stickers: {
        total: {},
        hour: {},
        day: {},
        week: {},
        month: {}
    }
});

let stats: Stats = TimerStore.ensure("stats", {
    messages: {
        total: 0,
        hour: 0,
        day: 0,
        week: 0,
        month: 0
    },
    attachments: {
        total: 0,
        hour: 0,
        day: 0,
        week: 0,
        month: 0
    },
    embeds: {
        total: 0,
        hour: 0,
        day: 0,
        week: 0,
        month: 0
    },
    stickers: {
        total: 0,
        hour: 0,
        day: 0,
        week: 0,
        month: 0
    },
    servers: {
        total: [],
        hour: [],
        day: [],
        week: [],
        month: []
    }
});

let hourlyAnn: NewsChannel;
let dailyAnn: NewsChannel;
let weeklyAnn: NewsChannel;
let monthlyAnn: NewsChannel;

client.on("ready", async(resClient) => {
    await initializeCommands(client).then(async(deployed) => {
        await deploy("951160606390632488", deployed.slashCommands.json)
            .then(ret => { DBMain(green`Deployed {white ${ret.length}} commands${ret.global ? " globally." : ""}`); })
            .catch(err => { DBMain(red`Couldn't deploy commands.\n=> ${err.name}: {white ${err.message}}`); process.exit(1); });
        DBMain(chalk.green`{white DCM} Discord Client online [ {white ${resClient.user.tag}} / {white ${resClient.user.id}} ]`);
        hourlyAnn = client.channels.cache.get("961299000554848316")! as NewsChannel;
        dailyAnn = client.channels.cache.get("951151805562224710")! as NewsChannel;
        weeklyAnn = client.channels.cache.get("951152031647809556")! as NewsChannel;
        monthlyAnn = client.channels.cache.get("951152046441107496")! as NewsChannel;
    }).catch(err => {
        DBMain(err); 
        process.exit(1);
    });

    selfChkD();
}).on("warn", (message) => {
    DBMain(yellow`A warning was thrown.\n-> {white ${message}}`);
}).on("debug", (message) => {
    DBMain(blueBright(message));
}).on("invalidated", () => {
    DBMain(red`Bot session invalidated. Exiting...`);
    process.exit(2);
}).on("error", (err) => {
    DBMain(red`An error occured.\n=> ${err.name}: {white ${err.message}}`);
    if(!isMainThread) { parentPort!.postMessage("restart"); }
}).on("messageCreate", async(message) => {
    if(message.reference && !records.messages.anmMap[message.reference.messageId!] && message.reference.guildId !== message.guildId) {
        records.messages.anmMap[message.reference.messageId!] = message.id;
        if(!stats.servers.total.includes(message.reference.guildId!)) stats.servers.total.push(message.reference.guildId!);
        if(!stats.servers.hour.includes(message.reference.guildId!)) stats.servers.hour.push(message.reference.guildId!);
        if(!stats.servers.day.includes(message.reference.guildId!)) stats.servers.day.push(message.reference.guildId!);
        if(!stats.servers.week.includes(message.reference.guildId!)) stats.servers.week.push(message.reference.guildId!);
        if(!stats.servers.month.includes(message.reference.guildId!)) stats.servers.month.push(message.reference.guildId!);
        stats.messages.total++; stats.messages.hour++;- stats.messages.day++; stats.messages.week++; stats.messages.month++; 

        let arid: string, erid: string, srid: string;
        if(message.attachments.size > 0) { 
            arid = randomUUID(); 
            records.attachments.total[arid] = []; 
            records.attachments.hour[arid] = []; 
            records.attachments.day[arid] = []; 
            records.attachments.week[arid] = []; 
            records.attachments.month[arid] = []; 
        } else arid = "<No Attachments>";
        
        if(message.embeds.length > 0) { 
            erid = randomUUID(); 
            records.embeds.total[erid] = []; 
            records.embeds.hour[erid] = []; 
            records.embeds.day[erid] = []; 
            records.embeds.week[erid] = []; 
            records.embeds.month[erid] = []; 
        } else erid = "<No Embeds>";

        if(message.stickers.size > 0) { 
            srid = randomUUID(); 
            records.stickers.total[erid] = []; 
            records.stickers.hour[erid] = []; 
            records.stickers.day[erid] = []; 
            records.stickers.week[erid] = []; 
            records.stickers.month[erid] = []; 
        } else srid = "<No Stickers>";

        const msgDate = new Date(message.createdTimestamp);
        let announcementObj: Announcement = {
            "Time": msgDate.toLocaleString() + " (" + message.createdTimestamp + ` ${msgDate.getTimezoneOffset()})`,
            "Server": message.author.username.substring(0, message.author.username.lastIndexOf("#") - 1),
            "Channel": message.author.username.substring(message.author.username.lastIndexOf("#")),

            "Server ID": message.reference.guildId!,
            "Channel ID": message.reference.channelId!,
            "Message ID": message.reference.messageId!,
            "Announcement ID": message.id,
            "Webhook ID": message.webhookId ? message.webhookId : "<No Webhook - How?>",

            "Content": message.content,
            "Clean Content": message.cleanContent,

            "Message Link (SGIV)": message.url,
            "Message Link (Srce)": `https://discord.com/channels/${message.reference.guildId}/${message.reference.channelId}/${message.reference.messageId}`,
            "Embeds Reference UUID": erid,
            "Attachments Reference UUID": arid,
            "Stickers Reference UUID": srid,
        }

        let currentIdx = 0;
        message.attachments.forEach(async attachment => {
            currentIdx++;
            records.attachments.total[arid].push(attachment); 
            records.attachments.hour[arid].push(attachment); 
            records.attachments.day[arid].push(attachment); 
            records.attachments.week[arid].push(attachment); 
            records.attachments.month[arid].push(attachment); 
            const attachmentName = attachment.name || "unknown";
            await downloadURI(attachment.url, `${message.id}_${currentIdx}_${attachmentName}`, join(__dirname, "attachments")).then(path => {
                DBMain(green`Downloaded attachment ${currentIdx} [ {white ${attachmentName}} / {white ${attachment.id}} ] from message {white ${message.id}} to {white ${path}}.`);
            }).catch(err => {
                DBMain(red`Couldn't download attachment ${currentIdx} [ {white ${attachmentName}} / {white ${attachment.id}} ] from message {white ${message.id}}.\n-> ${err.name}: {white ${err.message}}`);
            });

            stats.attachments.total++; stats.attachments.hour++; stats.attachments.day++; stats.attachments.week++; stats.attachments.month++;
        });

        currentIdx = 0;
        message.stickers.forEach(async sticker => {
            currentIdx++;
            records.stickers.total[arid].push(sticker); 
            records.stickers.hour[arid].push(sticker); 
            records.stickers.day[arid].push(sticker); 
            records.stickers.week[arid].push(sticker); 
            records.stickers.month[arid].push(sticker); 
            await downloadURI(sticker.url, `${message.id}_${currentIdx}_${basename(new URL(sticker.url).pathname)}`, join(__dirname, "stickers")).then(path => {
                DBMain(green`Downloaded sticker ${currentIdx} [ {white ${sticker.name}} / {white ${sticker.id}} ] from message {white ${message.id}} to {white ${path}}.`);
            }).catch(err => {
                DBMain(red`Couldn't download sticker ${currentIdx} [ {white ${sticker.name}} / {white ${sticker.id}} ] from message {white ${message.id}}.\n-> ${err.name}: {white ${err.message}}`);
            });

            stats.stickers.total++; stats.stickers.hour++; stats.stickers.day++; stats.stickers.week++; stats.stickers.month++;
        });

        message.embeds.forEach(async embed => {
            records.embeds.total[erid].push(embed); 
            records.embeds.day[erid].push(embed); 
            records.embeds.week[erid].push(embed); 
            records.embeds.month[erid].push(embed);

            stats.embeds.total++; stats.embeds.hour++; stats.embeds.day++; stats.embeds.week++; stats.embeds.month++;
        });

        records.messages.total[message.id] = announcementObj;
        records.messages.hour[message.id] = announcementObj;
        records.messages.day[message.id] = announcementObj;
        records.messages.week[message.id] = announcementObj;
        records.messages.month[message.id] = announcementObj;
    }
}).on("interactionCreate", async interaction => {
	if(!interaction.isCommand()) return;
    const command = client.commands!.get(interaction.commandName);

	if(command) {
        if(!command.disabled) {
            command.execute(client, interaction, { stats: stats, records: records });
            DBMain(chalk.blueBright`[ {white ${interaction.user.tag}} / {white ${interaction.user.id}} ] ran [ {white ${command.name}} / {white ${interaction.commandId}} ]`);
        } else {
            interaction.reply({ ephemeral: true, embeds: [ embeds.error(`**${command.name}** is disabled`) ] });
        }
    } else {
        DBMain(chalk.red`! Command not found: [ {white ${interaction.commandName}} / {white ${interaction.commandId}} ]`);
        interaction.reply({ ephemeral: true, embeds: [ embeds.error(`Command not found - This is probably an API hiccup. Don't report it.`) ] });
    }
});

let delay: { hour: number, day: number, week: number, month: number } = TimerStore.ensure("delayProg", { day: 86400000, week: 604800000, month: 2592000000 });

process.on("exit", (code) => { 
    DBMain(yellow`(Exit ${code}) Saving...`); 
    TimerStore.set("delayProg", delay);
    TimerStore.set("stats", stats); 
    TimerStore.set("records", records);
    DBMain(green`(Exit ${code}) Saved.`);
});

DBMain(blueBright("Connecting to Discord..."));
client.login(process.env.token).then(() => {
    const DBStat = debug((isMainThread ? "Discord" : workerData.debuggerName) + "/Stat");
    setInterval(() => {
        const memProc = process.memoryUsage.rss() / (1024 * 1024), memSys = totalmem() / (1024 * 1024), cpuUse = process.cpuUsage();
        DBStat(blueBright`Memory Usage: [ {white ${memProc.toFixed(2)}} / {white ${memSys.toFixed(2)}} MB ({white ${(memProc/memSys).toFixed(2)}%}) ] - CPU Usage [ User: {white ${cpuUse.user}}μs / System: {white ${cpuUse.system}}μs ] - Uptime: {white ${humanize(client.uptime!)}}`);
        DBStat(blueBright`Collected Announcements (Msgs.): [ All: {white ${stats.messages.total}} | This hour: {white ${stats.messages.hour}} / Today: {white ${stats.messages.day}} / This week: {white ${stats.messages.week}} / This month: {white ${stats.messages.month}} ]`);
        DBStat(blueBright`Collected Announcements (Svrs.): [ All: {white ${stats.servers.total.length}} | This hour: {white ${stats.servers.hour.length}} / Today: {white ${stats.servers.day.length}} / This week: {white ${stats.servers.week.length}} / This month: {white ${stats.servers.month.length}} ]`);
        DBStat(blueBright`Collected Announcements (Attc.): [ All: {white ${stats.attachments.total}} | This hour: {white ${stats.attachments.hour}} / Today: {white ${stats.attachments.day}} / This week: {white ${stats.attachments.week}} / This month: {white ${stats.attachments.month}} ]`);
        DBStat(blueBright`Collected Announcements (Embd.): [ All: {white ${stats.embeds.total}} | This hour: {white ${stats.embeds.hour}} / Today: {white ${stats.embeds.day}} / This week: {white ${stats.embeds.week}} / This month: {white ${stats.embeds.month}} ]`);
        DBStat(blueBright`Collected Announcements (Stck.): [ All: {white ${stats.stickers.total}} | This hour: {white ${stats.stickers.hour}} / Today: {white ${stats.stickers.day}} / This week: {white ${stats.stickers.week}} / This month: {white ${stats.stickers.month}} ]`);
        DBStat(blueBright`\nTimeouts: [ Hourly: {white ${humanize(delay.hour)}} ({white ${delay.hour}}) / Daily: {white ${humanize(delay.day)}} ({white ${delay.day}}) / Weekly: {white ${humanize(delay.week)}} ({white ${delay.week}}) / Monthly: {white ${humanize(delay.month)}} ({white ${delay.month}}) ]`);
        DBStat(blueBright`Users: {white ${client.users.cache.size}} - Channels: {white ${client.channels.cache.size}} `);
    }, 7500);
}).catch(error => {
    DBMain(chalk.red`Failed to logon.\n=> ${error.name}: {white ${error.message}}\n=> Token Provided: {white ${process.env.token}}`);
});

function selfChkD() {
    delay = TimerStore.ensure("delayProg", { hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 });

    setInterval(() => { 
        if(delay.hour > 100) { delay.hour -= 100; } else { TimerStore.set("delayProg", 3600000, "hour"); delay = TimerStore.fetch("delayProg"); hourly(); }
        if(delay.day > 100) { delay.day -= 100; } else { TimerStore.set("delayProg", 86400000, "day"); delay = TimerStore.fetch("delayProg"); daily(); } 
        if(delay.week > 100) { delay.week -= 100; } else { TimerStore.set("delayProg", 604800000, "week"); delay = TimerStore.fetch("delayProg"); weekly(); } 
        if(delay.month > 100) { delay.month -= 100; } else { TimerStore.set("delayProg", 2592000000, "month"); delay = TimerStore.fetch("delayProg"); monthly(); } 
    }, 100);

    setInterval(() => { TimerStore.set("delayProg", delay); TimerStore.set("stats", stats); TimerStore.set("records", records); }, 2500);
}

function hourly() {
    if(stats.messages.hour > 0) {
        hourlyAnn.send({
            content: `Over the last hour, **${stats.messages.hour}** message${stats.messages.hour === 1 ? "" : "s"} containing **${stats.attachments.hour}** attachment${stats.attachments.hour === 1 ? "" : "s"} and **${stats.embeds.hour}** embed${stats.embeds.hour === 1 ? "" : "s"} were collected in **${stats.servers.hour.length}** unique server${stats.servers.hour.length === 1 ? "" : "s"}.`,
            files: [
                {
                    attachment: packageDoc(Object.values(records.messages.hour)),
                    name: `AnnouncementsH${Date.now()}.xlsx`,
                    description: "Daily Exported Announcements"
                }
            ]
        }).then(message => {
            stats.messages.hour = 0; stats.servers.hour = []; stats.attachments.hour = 0; stats.embeds.hour = 0; stats.stickers.hour = 0;
            records.messages.hour = {}; records.attachments.hour = {}; records.embeds.hour = {}; records.stickers.hour = {};
            if(message.crosspostable) message.crosspost().catch(err => { DBMain(red`Couldn't crosspost hourly news.\n-> ${err.name}: {white ${err.message}}`); });
        }).catch(err => { DBMain(red`Couldn't send hourly news.\n-> ${err.name}: {white ${err.message}}`); });
    } else {
        hourlyAnn.send("No new announcements were collected in the last hour.");
    }
}

function daily() {
    if(stats.messages.day > 0) {
        dailyAnn.send({
            content: `Over the last day, **${stats.messages.day}** message${stats.messages.day === 1 ? "" : "s"} containing **${stats.attachments.day}** attachment${stats.attachments.day === 1 ? "" : "s"} and **${stats.embeds.day}** embed${stats.embeds.day === 1 ? "" : "s"} were collected in **${stats.servers.day.length}** unique server${stats.servers.day.length === 1 ? "" : "s"}.`,
            files: [
                {
                    attachment: packageDoc(Object.values(records.messages.day)),
                    name: `AnnouncementsD${Date.now()}.xlsx`,
                    description: "Daily Exported Announcements"
                }
            ]
        }).then(message => {
            stats.messages.day = 0; stats.servers.day = []; stats.attachments.day = 0; stats.embeds.day = 0; stats.stickers.day = 0;
            records.messages.day = {}; records.attachments.day = {}; records.embeds.day = {}; records.stickers.day = {};
            if(message.crosspostable) message.crosspost().catch(err => { DBMain(red`Couldn't crosspost daily news.\n-> ${err.name}: {white ${err.message}}`); });
        }).catch(err => { DBMain(red`Couldn't send daily news.\n-> ${err.name}: {white ${err.message}}`); });
    } else {
        dailyAnn.send("No new announcements were collected on the last day.");
    }
}

function weekly() {
    if(stats.messages.week > 0) {
        weeklyAnn.send({
            content: `Over the last week, **${stats.messages.week}** message${stats.messages.week === 1 ? "" : "s"} containing **${stats.attachments.week}** attachment${stats.attachments.week === 1 ? "" : "s"} and **${stats.embeds.week}** embed${stats.embeds.week === 1 ? "" : "s"} were collected in **${stats.servers.week.length}** unique server${stats.servers.week.length === 1 ? "" : "s"}.`,
            files: [
                {
                    attachment: packageDoc(Object.values(records.messages.week)),
                    name: `AnnouncementsW${Date.now()}.xlsx`,
                    description: "Weekly Exported Announcements"
                }
            ]
        }).then(message => {
            stats.messages.week = 0; stats.servers.week = []; stats.attachments.week = 0; stats.embeds.week = 0; stats.stickers.week = 0;
            records.messages.week = {}; records.attachments.week = {}; records.embeds.week = {}; records.stickers.week = {};
            if(message.crosspostable) message.crosspost().catch(err => { DBMain(red`Couldn't crosspost weekly news.\n-> ${err.name}: {white ${err.message}}`); });
        }).catch(err => { DBMain(red`Couldn't send weekly news.\n-> ${err.name}: {white ${err.message}}`); });
    } else {
        weeklyAnn.send("No new announcements were collected in the last week. (This statistically should not be possible, and may indicate an error in DCM.)");
    }
}

function monthly() {
    if(stats.messages.month > 0) {
        monthlyAnn.send({
            content: `Over the last month, **${stats.messages.month}** message${stats.messages.month === 1 ? "" : "s"} containing **${stats.attachments.month}** attachment${stats.attachments.month === 1 ? "" : "s"} and **${stats.embeds.month}** embed${stats.embeds.month === 1 ? "" : "s"} were collected in **${stats.servers.month.length}** unique server${stats.servers.month.length === 1 ? "" : "s"}.`,
            files: [
                {
                    attachment: packageDoc(Object.values(records.messages.month)),
                    name: `AnnouncementsM${Date.now()}.xlsx`,
                    description: "Monthly Exported Announcements"
                }
            ]
        }).then(message => {
            stats.messages.month = 0; stats.servers.month = []; stats.attachments.month = 0; stats.embeds.month = 0; stats.stickers.month = 0;
            records.messages.month = {}; records.attachments.month = {}; records.embeds.month = {}; records.stickers.month = {};
            if(message.crosspostable) message.crosspost().catch(err => { DBMain(red`Couldn't crosspost monthly news.\n-> ${err.name}: {white ${err.message}}`); });
        }).catch(err => { DBMain(red`Couldn't send monthly news.\n-> ${err.name}: {white ${err.message}}`); });
    } else {
        monthlyAnn.send("No new announcements were collected in the last month. (This statistically should not be possible, and may indicate an error in DCM.)");
    }
}

function packageDoc(records: any[]): Buffer {
    const workbook = xlsx.utils.book_new();
    const jsonWorkSheet = xlsx.utils.json_to_sheet(records);
    xlsx.utils.book_append_sheet(workbook, jsonWorkSheet, "Announcements");
    return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function downloadURI(url: string, name: string, location: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fetch(url).then(res => {
            if(res.status !== 200) { reject(new Error(`${res.status} - ${res.statusText}`)); }
            res.body.pipe(createWriteStream(join(location + "/" + name))).on("finish", () => { resolve(location); }).on("error", (err: Error) => { reject(err); });
        }).catch(err => {
            reject(err);
        });
    });
}