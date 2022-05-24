import { Client, Intents, Message, MessageAttachment, MessageEmbed, NewsChannel, Snowflake, Sticker } from 'discord.js';
import { ExtendedClient, initializeCommands, deploy } from "./deploy.js";
import { isMainThread, parentPort, workerData } from 'worker_threads';
import { join, dirname, basename } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from 'node:url';
import { randomUUID } from "node:crypto";
import embeds from "./embeds.js";
import fetch from "node-fetch";
import chalk from "chalk";
import Enmap from "enmap";
import debug from "debug";
import xlsx from "xlsx";
import Jimp from 'jimp';

const TimerStore = new Enmap("TimerStore");

const dbgH = (isMainThread ? "Discord" : workerData.debuggerName);
const DBStat = debug(dbgH + "/Stat");
const DBVerb = debug(dbgH + "/Verbose");
const DBUser = debug(dbgH + "/User");
const DBFile = debug(dbgH + "/File");
const DBWrn = debug(dbgH + "/Warn");

const DBHour = debug(dbgH + "/Hourly");
const DBDay = debug(dbgH + "/Daily");
const DBWeek = debug(dbgH + "/Weekly");
const DBMonth = debug(dbgH + "/Monthly");

const client: ExtendedClient = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
client.dataDir = (dirname(fileURLToPath(import.meta.url)) + process.env.dataDirectory);

const { green, yellow, blueBright, red, cyan, magenta } = chalk;
// // //
export type Stats = {
    messages: { total: number, hour: number, day: number, week: number, month: number }, 
    attachments: { total: number, hour: number, day: number, week: number, month: number }, 
    embeds: { total: number, hour: number, day: number, week: number, month: number }, 
    stickers: { total: number, hour: number, day: number, week: number, month: number }, 
    edits: { total: number, hour: number, day: number, week: number, month: number }, 
    deletions: { total: number, hour: number, day: number, week: number, month: number }, 
    servers: { total: string[], hour: string[], day: string[], week: string[], month: string[] },
};

export type Records = { 
    messages: {
        total: { [key: Snowflake]: Announcement }, 
        hour: { [key: Snowflake]: Announcement }, 
        day: { [key: Snowflake]: Announcement },
        week: { [key: Snowflake]: Announcement }, 
        month: { [key: Snowflake]: Announcement },
        [key: string]: any
    },
    edits: { [key: Snowflake]: Date[] },
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
    },
    modifications: { 
        [key: string]: { modified: number, last: number }
    },
    anmMap: { [key: string]: Snowflake },
    lastSol: 0,
    lastEID: 0
};

export type Announcement = {
    Time: string, 
    Timestamp: string,
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
    "Deleted": string,
    "Modified": string,
    [key: string]: any;
}

let records: Records = TimerStore.ensure("records", {
    messages: {
        total: {},
        hour: {},
        day: {},
        week: {},
        month: {}
    },
    edits: {},
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
    },
    anmMap: {},
    modifications: {},
    lastSol: 0,
    lastEID: 0
});

let stats: Stats = TimerStore.ensure("stats", {
    messages: {
        total: 0,
        hour: 0,
        day: 0,
        week: 0,
        month: 0
    },
    edits: {
        total: 0,
        hour: 0,
        day: 0,
        week: 0,
        month: 0
    },
    deletions: {
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

let APOD: NewsChannel;
let EPIC: NewsChannel;
let MARS: NewsChannel;

const supplementaryEnv = JSON.parse(process.env.adConfig || "{}");

client.on("ready", async(resClient) => {
    await initializeCommands(client).then(async(deployed) => {
        await deploy("951160606390632488", deployed.slashCommands.json)
            .then(ret => { DBStat(green`Deployed {white ${ret.length}} commands${ret.global ? " globally." : ""}`); })
            .catch(err => { DBStat(red`Couldn't deploy commands.\n=> ${err.name}: {white ${err.message}}`); });
        DBStat(chalk.green`{white DCM} Discord Client online [ {white ${resClient.user.tag}} / {white ${resClient.user.id}} ]`);
        APOD = client.channels.cache.get("977021060287430736")! as NewsChannel;
        EPIC = client.channels.cache.get("977020087846469672")! as NewsChannel;
        MARS = client.channels.cache.get("977020112789995520")! as NewsChannel;
        hourlyAnn = client.channels.cache.get("961299000554848316")! as NewsChannel;
        dailyAnn = client.channels.cache.get("951151805562224710")! as NewsChannel;
        weeklyAnn = client.channels.cache.get("951152031647809556")! as NewsChannel;
        monthlyAnn = client.channels.cache.get("951152046441107496")! as NewsChannel;
    }).catch(err => {
        DBStat(red`Couldn't initialize commands.\n=> ${err.name}: {white ${err.message}}`);
    });

    selfChkD();
}).on("warn", (message) => {
    DBWrn(yellow`A warning was thrown.\n-> {white ${message}}`);
}).on("debug", (message) => {
    DBVerb(blueBright(message));
}).on("invalidated", () => {
    DBStat(red`Bot session invalidated. Exiting...`);
}).on("error", (err) => {
    DBWrn(red`An error occured.\n=> ${err.name}: {white ${err.message}}`);
    if(!isMainThread) { parentPort!.postMessage("restart"); }
}).on("messageCreate", (message) => { 
    addLog(message);
}).on("messageUpdate", async (_oldMessage, newMessage) => {
    if(newMessage.reference && newMessage.reference.guildId !== newMessage.guildId) {
        if(newMessage.content === "[Original Message Deleted]") {
            stats.deletions.total++;
            stats.deletions.month++;
            stats.deletions.week++;
            stats.deletions.day++;
            stats.deletions.hour++;

            for(const time in records.messages) {
                for(const id in records.messages[time]) {
                    const announcement: Announcement = records.messages[time][id];
                    if(announcement && announcement['Message ID'] && announcement['Message ID'].startsWith(newMessage.reference.messageId!)) 
                        records.messages[time][id]["Deleted"] = "Yes";
                }
            }
        } else {
            const modified = await addLog(await newMessage.fetch());

            if(modified) {
                for(const time in records.messages) {
                    for(const id in records.messages[time]) {
                        const announcement: Announcement = records.messages[time][id];
                        if(announcement && announcement['Message ID'] && announcement['Message ID'].startsWith(newMessage.reference.messageId!)) 
                            records.messages[time][id]["Modified"] = `Yes (${modified} times)`;
                    }
                }
            }
        }
    }
}).on("interactionCreate", async interaction => {
	if(!interaction.isCommand()) return;
    const command = client.commands!.get(interaction.commandName);

	if(command) {
        if(!command.disabled) {
            command.execute(client, interaction, { stats: stats, records: records }, supplementaryEnv);
            DBUser(chalk.blueBright`[ {white ${interaction.user.tag}} / {white ${interaction.user.id}} ] ran [ {white ${command.name}} / {white ${interaction.commandId}} ]`);
        } else {
            interaction.reply({ ephemeral: true, embeds: [ embeds.error(`**${command.name}** is disabled`) ] });
        }
    } else {
        DBUser(chalk.red`! Command not found: [ {white ${interaction.commandName}} / {white ${interaction.commandId}} ]`);
        interaction.reply({ ephemeral: true, embeds: [ embeds.error(`Command not found - This is probably an API hiccup. Don't report it.`) ] });
    }
});

process.on("beforeExit", (code) => { 
    DBWrn(yellow`(Exit ${code}) Saving...`); 
    TimerStore.set("delayProg", delay);
    TimerStore.set("stats", stats); 
    TimerStore.set("records", records);
    DBWrn(green`(Exit ${code}) Saved.`);
});

function addLog(message: Message<boolean>): Promise<number> | false {
    const modded = records.modifications[message.id];
    const prev = records.messages.total[message.id];

    if(!prev || prev.Timestamp !== message.createdTimestamp.toString()){
        let mid = message.id, updated = false;
        if(modded && modded.last < message.editedTimestamp!) { 
            modded.modified++; modded.last = message.editedTimestamp!; 
            mid += (modded.modified ? `-e${modded.modified}` : "");
            records.edits[message.id].unshift(message.editedAt!);
            updated = true;
        } else {
            records.modifications[message.id] = { modified: 0, last: message.createdTimestamp };
            records.edits[message.id] = []
        }

        return new Promise((resolve) => {
            if(message.reference) {
                if((updated || (!records.anmMap[message.reference.messageId!])) && message.reference.guildId !== message.guildId) {
                    records.anmMap[message.reference.messageId!] = message.id;
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
                        "Time": msgDate.toLocaleString(),
                        "Timestamp": message.createdTimestamp.toString(),

                        "Server": message.author.username.substring(0, message.author.username.lastIndexOf("#") - 1),
                        "Channel": message.author.username.substring(message.author.username.lastIndexOf("#")),
            
                        "Server ID": message.reference.guildId!,
                        "Channel ID": message.reference.channelId!,
                        "Message ID": message.reference.messageId!,
                        "Announcement ID": mid,
                        "Webhook ID": message.webhookId ? message.webhookId : "<No Webhook - How?>",
            
                        "Content": message.content,
                        "Clean Content": message.cleanContent,
            
                        "Message Link (SGIV)": message.url,
                        "Message Link (Srce)": `https://discord.com/channels/${message.reference.guildId}/${message.reference.channelId}/${message.reference.messageId}`,
                        "Embeds Reference UUID": erid,
                        "Attachments Reference UUID": arid,
                        "Stickers Reference UUID": srid,
            
                        "Deleted": "No",
                        "Modified": "No",
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
                        await downloadURI(attachment.url, `${mid}_${currentIdx}_${attachmentName}`, join(client.dataDir!, "attachments", getDate())).then(path => {
                            DBFile(green`Downloaded attachment ${currentIdx} [ {white ${attachmentName}} / {white ${attachment.id}} ] from message {white ${mid}} to {white ${path}}.`);
                        }).catch(err => {
                            DBFile(red`Couldn't download attachment ${currentIdx} [ {white ${attachmentName}} / {white ${attachment.id}} ] from message {white ${mid}}.\n-> ${err.name}: {white ${err.message}}`);
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
                        await downloadURI(sticker.url, `${mid}_${currentIdx}_${basename(new URL(sticker.url).pathname)}`, join(client.dataDir!, "stickers", getDate())).then(path => {
                            DBFile(green`Downloaded sticker ${currentIdx} [ {white ${sticker.name}} / {white ${sticker.id}} ] from message {white ${mid}} to {white ${path}}.`);
                        }).catch(err => {
                            DBFile(red`Couldn't download sticker ${currentIdx} [ {white ${sticker.name}} / {white ${sticker.id}} ] from message {white ${mid}}.\n-> ${err.name}: {white ${err.message}}`);
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
            
                    records.messages.total[mid] = announcementObj;
                    records.messages.hour[mid] = announcementObj;
                    records.messages.day[mid] = announcementObj;
                    records.messages.week[mid] = announcementObj;
                    records.messages.month[mid] = announcementObj;

                    if(updated) {
                        stats.edits.total++; stats.edits.hour++; stats.edits.day++; stats.edits.week++; stats.edits.month++;
                        resolve(records.modifications[message.id].modified);
                    }
                } else {
                    console.error("T-Err2!!!!")
                }
            }
        });
    } else {
        return false;
    }
}

let delay: { hour: number, day: number, week: number, month: number } = TimerStore.ensure("delayProg", { day: 86400000, week: 604800000, month: 2592000000 });

DBStat(blueBright("Connecting to Discord..."));
client.login(process.env.token).catch(error => {
    DBWrn(chalk.red`Failed to logon.\n=> ${error.name}: {white ${error.message}}\n=> Token Provided: {white ${process.env.token}}`);
});

function selfChkD() {
    DBStat(magenta`Setting up timers...`);
    delay = TimerStore.ensure("delayProg", { hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 });

    setInterval(() => { 
        if(delay.hour > 5000) { delay.hour -= 5000; } else { TimerStore.set("delayProg", 3600000, "hour"); delay = TimerStore.fetch("delayProg"); hourly(); }
        if(delay.day > 5000) { delay.day -= 5000; } else { TimerStore.set("delayProg", 86400000, "day"); delay = TimerStore.fetch("delayProg"); daily(); } 
        if(delay.week > 5000) { delay.week -= 5000; } else { TimerStore.set("delayProg", 604800000, "week"); delay = TimerStore.fetch("delayProg"); weekly(); } 
        if(delay.month > 5000) { delay.month -= 5000; } else { TimerStore.set("delayProg", 2592000000, "month"); delay = TimerStore.fetch("delayProg"); monthly(); } 
    }, 5000);

    setInterval(() => { TimerStore.set("delayProg", delay); TimerStore.set("stats", stats); TimerStore.set("records", records); }, 2500);
    DBStat(magenta`Timers initialized.`);
}

async function hourly() {
    DBHour(blueBright("Announcement check..."));
    if(stats.messages.hour > 0) {
        DBHour(green`{white ${stats.messages.hour}} messages were collected in the last hour.`);
        hourlyAnn.send({
            content: `Over the last hour, **${stats.messages.hour}** announcement${stats.messages.hour === 1 ? "" : "s"} containing **${stats.attachments.hour}** attachment${stats.attachments.hour === 1 ? "" : "s"} and **${stats.embeds.hour}** embed${stats.embeds.hour === 1 ? "" : "s"} were collected in **${stats.servers.hour.length}** unique server${stats.servers.hour.length === 1 ? "" : "s"} with **${stats.edits.hour}** edits.`,
            files: await getFiles(Object.values(records.messages.hour), "H", "Hourly Announcements")
        }).then(message => {
            DBHour(green("Collection announcement sent."));
            stats.messages.hour = 0; stats.servers.hour = []; stats.attachments.hour = 0; stats.embeds.hour = 0; stats.stickers.hour = 0; stats.edits.hour = 0; stats.deletions.hour = 0;
            records.messages.hour = {}; records.attachments.hour = {}; records.embeds.hour = {}; records.stickers.hour = {};
            if(message.crosspostable) message.crosspost().catch(err => { DBWrn(red`Couldn't crosspost hourly announcements.\n-> ${err.name}: {white ${err.message}}`); });
        }).catch(err => { DBWrn(red`Couldn't send hourly announcements.\n-> ${err.name}: {white ${err.message}}`); });
    } else {
        DBHour(blueBright("No announcements collected."));
        hourlyAnn.send("No new announcements were collected in the last hour.");
    }

    DBHour(blueBright("EPIC check..."));
    fetch("https://api.nasa.gov/EPIC/api/natural?api_key=wy8cF7LEUdS9cZUEk0o5eiZeFYWypIXGHBI2Xeyc").then(async response => {
        if(response.status !== 200) return DBWrn(red`Couldn't fetch NASA's EPIC Earth Photo.\n-> Status Code: {white ${response.status}} - {white ${response.statusText}}`);
        let data = (await response.json()).pop();
        
        if(records.lastEID !== data.image) {
            DBHour(green`New EPIC image found. (${records.lastEID} -> ${data.image})`);
            records.lastEID = data.image;
            const url = `https://api.nasa.gov/EPIC/archive/natural/${data.identifier.substring(0, 4)}/${data.identifier.substring(4, 6)}/${data.identifier.substring(6, 8)}/png/${data.image}.png?api_key=DEMO_KEY`
            
            EPIC.send(`Identifier : \`${data.identifier}\`\nVersion : \`${data.version}\`\n\nImage URL : ${url}\nImage Name : \`${data.image}\`\nCaption : \`${data.caption}\`\nDate : \`${data.date}\`\n\nDSCOVR Position :\n X : \`${data.dscovr_j2000_position.x}\`\n Y : \`${data.dscovr_j2000_position.y}\`\n Z : \`${data.dscovr_j2000_position.z}\`\nSun Position :\n X : \`${data.sun_j2000_position.x}\`\n Y : \`${data.sun_j2000_position.y}\`\n Z : \`${data.sun_j2000_position.z}\`\nMoon Position :\n X : \`${data.lunar_j2000_position.x}\`\n Y : \`${data.lunar_j2000_position.y}\`\n Z : \`${data.lunar_j2000_position.z}\`\n\nCentroid Coordinates :\n Latitude : \`${data.centroid_coordinates.lat}\`\n Longitude : \`${data.centroid_coordinates.lon}\`\nAttitude Quaternions :\n q0 : \`${data.attitude_quaternions.q0}\`\n q1 : \`${data.attitude_quaternions.q1}\`\n q2 : \`${data.attitude_quaternions.q2}\`\n q3 : \`${data.attitude_quaternions.q3}\``).then(message => {
                DBHour(blueBright("EPIC announcement sent."));
                message.crosspost().catch(err => { DBWrn(red`Couldn't crosspost NASA's EPIC Earth Photo.\n-> ${err.name}: {white ${err.message}}`); });
            }).catch(err => { DBWrn(red`Couldn't send NASA's EPIC Earth Photo.\n-> ${err.name}: {white ${err.message}}`); });
        } else {
            DBHour(blueBright("No new EPIC photo."));
        }
    });
}

async function daily() {
    DBDay(blueBright("Announcement check..."));
    if(stats.messages.day > 0) {
        DBDay(green`{white ${stats.messages.day}} messages were collected in the last day.`);
        dailyAnn.send({
            content: `Over the last day, **${stats.messages.day}** message${stats.messages.day === 1 ? "" : "s"} containing **${stats.attachments.day}** attachment${stats.attachments.day === 1 ? "" : "s"} and **${stats.embeds.day}** embed${stats.embeds.day === 1 ? "" : "s"} were collected in **${stats.servers.day.length}** unique server${stats.servers.day.length === 1 ? "" : "s"} with **${stats.edits.day}** edits.`,
            files: await getFiles(Object.values(records.messages.day), "D", "Daily Announcements")
        }).then(message => {
            DBDay(green("Collection announcement sent."));
            stats.messages.day = 0; stats.servers.day = []; stats.attachments.day = 0; stats.embeds.day = 0; stats.stickers.day = 0; stats.edits.day = 0; stats.deletions.day = 0;
            records.messages.day = {}; records.attachments.day = {}; records.embeds.day = {}; records.stickers.day = {};
            if(message.crosspostable) message.crosspost().catch(err => { DBWrn(red`Couldn't crosspost daily announcements.\n-> ${err.name}: {white ${err.message}}`); });
        }).catch(err => { DBWrn(red`Couldn't send daily announcements.\n-> ${err.name}: {white ${err.message}}`); });
    } else {
        DBDay(blueBright("No announcements collected."));
        dailyAnn.send("No new announcements were collected on the last day.");
    }

    return new Promise(() => {
        DBDay(blueBright("APOD check..."));
        fetch("https://api.nasa.gov/planetary/apod?api_key=wy8cF7LEUdS9cZUEk0o5eiZeFYWypIXGHBI2Xeyc").then(async response => {
            if(response.status !== 200) return DBWrn(red`Couldn't fetch NASA's Astronomy Picture of the Day.\n-> Status Code: {white ${response.status}} - {white ${response.statusText}}`);
            let data = await response.json();

            APOD.send(`Copyright : \`${data.copyright}\`\nDate : \`${data.date}\`\n\nTitle : \`${data.title}\`\nExplanation : \`${data.explanation}\`\n\nMedia Type : \`${data.media_type}\`\nService Version : \`${data.service_version}\`\n\nURL : ${data.url}\n${data.hdurl ? `HD URL : ${data.hdurl}\n` : ""}`).then(message => {
                DBDay(blueBright("APOD announcement sent."));
                message.crosspost().catch(err => { DBWrn(red`Couldn't crosspost NASA's Astronomy Picture of the Day.\n-> ${err.name}: {white ${err.message}}`); });
            }).catch(err => { DBWrn(red`Couldn't send NASA's Astronomy Picture of the Day.\n-> ${err.name}: {white ${err.message}}`); });
        });

        DBDay(blueBright("Curiosity Rover check..."));
        fetch("https://api.nasa.gov/mars-photos/api/v1/manifests/Curiosity/?api_key=wy8cF7LEUdS9cZUEk0o5eiZeFYWypIXGHBI2Xeyc").then(async response => {
            if(response.status !== 200) return DBWrn(red`Couldn't fetch NASA's Curiosity Mission Status.\n-> Status Code: {white ${response.status}} - {white ${response.statusText}}`);
            const data = (await response.json()).photo_manifest;

            if(records.lastSol !== data.max_sol) {
                DBHour(green`New Curiosity Rover data found. (${records.lastSol} -> ${data.max_sol})`);
                records.lastSol = data.max_sol;
                let post = { index: 0, strings: [ "" ], added: [] };
                let info = `ROVER DATA\n Name : ${data.name}\n Status : ${capitalizeFirstLetter(data.status)}\n Duration : ${data.max_sol} Sol (Mars Days)\n Photos Collected : ${data.total_photos}\n\n Launch Date : ${data.launch_date}\n Landing Date : ${data.landing_date}\n\n`;

                fetch(`https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos?sol=${data.max_sol}&api_key=wy8cF7LEUdS9cZUEk0o5eiZeFYWypIXGHBI2Xeyc`).then(async response => {
                    const pdata = (await response.json()).photos;
                    if(pdata.length > 0) {
                        let iIm = 0, dirC = data.max_date;

                        DBDay(blueBright("Reading image data..."));
                        for(const photo of pdata) {
                            iIm++;
                            info += `IMAGE ${iIm} DATA\n Camera Abbv. : ${photo.camera.name}\n Camera Full Name : ${photo.camera.full_name}\n Camera ID : ${photo.camera.id}\n Photo ID : ${photo.id}\n Earth Date : ${photo.earth_date}\n\n`

                            let grayscale = "";
                            const image = await Jimp.read(photo.img_src).catch(err => {
                                DBWrn(red`Couldn't read image.\n-> ${err.name}: {white ${err.message}}`);
                                grayscale = "Unk.";
                            });

                            await mkdir(`${client.dataDir}/curiosity_photos/${dirC}`).catch(err => { dirC = undefined;  DBWrn(red`Couldn't create Curiosity Rover image directory.\n-> ${err.name}: {white ${err.message}}`); });

                            if(image && dirC) {
                                image.writeAsync(`${client.dataDir}/curiosity_photos/${dirC}/${basename(new URL(photo.img_src).pathname)}`).catch(err => { 
                                    DBWrn(red`Couldn't save Curiosity Rover image.\n-> ${err.name}: {white ${err.message}}`);
                                });

                                const color = await checkColor(image);
                                if(color) {
                                    grayscale = "Clr.";
                                } else {
                                    grayscale = "B&W.";
                                }
                            } else {
                                grayscale = "Unk.";
                            }

                            const conString = `${photo.camera.name}->${iIm} (${grayscale}): <${photo.img_src}>\n`;
                            const combinedString = post.strings[post.index] + conString;

                            if(combinedString.length <= 2000) {
                                post.strings[post.index] = combinedString;
                            } else {
                                post.index++;
                                post.strings[post.index] = conString;
                            }
                        }

                        let iTc = 0, tW = 0;
                        DBDay(blueBright("Sending Curiosity Rover image announcements..."));
                        for(const message of post.strings) {
                            if(tW < 12) { // Don't allow this loop to go over a day, and possibly overlap with the next one.
                                if(iTc < 10) {
                                    await MARS.send(message).then(message => {
                                        DBDay(green("Rover data/image announcements sent."));
                                        message.crosspost().then(() => { iTc++; }).catch(err => { DBWrn(red`Couldn't crosspost Curiosity Rover Photos.\n-> ${err.name}: {white ${err.message}}`); });
                                    }).catch(err => { DBWrn(red`Couldn't send Curiosity Rover Photos.\n-> ${err.name}: {white ${err.message}}`); });
                                } else {
                                    sleep(3600000); // 1 hour
                                    iTc = 0;
                                    tW++;
                                }
                            }
                        }
                        
                        DBDay(blueBright("Sending Curiosity Rover data announcement..."));
                        await MARS.send({ files: [ { attachment: Buffer.from(info), name: `RCCData-${Date.now()}.txt`, description: "Camera/Rover Data" } ] }).then(message => {
                            message.crosspost().catch(err => { DBWrn(red`Couldn't crosspost Curiosity Rover Data.\n-> ${err.name}: {white ${err.message}}`); });
                        }).catch(err => { DBWrn(red`Couldn't send Curiosity Rover Data.\n-> ${err.name}: {white ${err.message}}`); });
                    } else {
                        DBWrn(red`Couldn't fetch Curiosity Rover photos.\n-> None available.`);
                    }
                });
            } else DBDay(blueBright("No new Curiosity Rover data."));
        });
    })
}

async function weekly() {
    DBWeek(blueBright("Announcement check..."));
    if(stats.messages.week > 0) {
        DBWeek(green`{white ${stats.messages.week}} messages were collected in the last week.`);
        weeklyAnn.send({
            content: `Over the last week, **${stats.messages.week}** message${stats.messages.week === 1 ? "" : "s"} containing **${stats.attachments.week}** attachment${stats.attachments.week === 1 ? "" : "s"} and **${stats.embeds.week}** embed${stats.embeds.week === 1 ? "" : "s"} were collected in **${stats.servers.week.length}** unique server${stats.servers.week.length === 1 ? "" : "s"} with **${stats.edits.week}** edits.`,
            files: await getFiles(Object.values(records.messages.week), "W", "Weekly Announcements")
        }).then(message => {
            DBWeek(green("Collection announcement sent."));
            stats.messages.week = 0; stats.servers.week = []; stats.attachments.week = 0; stats.embeds.week = 0; stats.stickers.week = 0; stats.edits.week = 0; stats.deletions.week = 0;
            records.messages.week = {}; records.attachments.week = {}; records.embeds.week = {}; records.stickers.week = {};
            if(message.crosspostable) message.crosspost().catch(err => { DBWrn(red`Couldn't crosspost weekly announcements.\n-> ${err.name}: {white ${err.message}}`); });
        }).catch(err => { DBWrn(red`Couldn't send weekly announcements.\n-> ${err.name}: {white ${err.message}}`); });
    } else {
        DBWeek(blueBright("No new weekly announcements."));
        weeklyAnn.send("No new announcements were collected in the last week. (This statistically should not be possible, and may indicate an error in DCM.)");
    }
}

async function monthly() {
    DBMonth(blueBright("Announcement check..."));
    if(stats.messages.month > 0) {
        DBMonth(green`{white ${stats.messages.month}} messages were collected in the last month.`);
        monthlyAnn.send({
            content: `Over the last month, **${stats.messages.month}** message${stats.messages.month === 1 ? "" : "s"} containing **${stats.attachments.month}** attachment${stats.attachments.month === 1 ? "" : "s"} and **${stats.embeds.month}** embed${stats.embeds.month === 1 ? "" : "s"} were collected in **${stats.servers.month.length}** unique server${stats.servers.month.length === 1 ? "" : "s"} with **${stats.edits.month}** edits.`,
            files: await getFiles(Object.values(records.messages.month), "M", "Monthly Announcements")
        }).then(message => {
            DBMonth(green("Collection announcement sent."));
            stats.messages.month = 0; stats.servers.month = []; stats.attachments.month = 0; stats.embeds.month = 0; stats.stickers.month = 0; stats.edits.month = 0; stats.deletions.month = 0;
            records.messages.month = {}; records.attachments.month = {}; records.embeds.month = {}; records.stickers.month = {}; 
            if(message.crosspostable) message.crosspost().catch(err => { DBWrn(red`Couldn't crosspost monthly announcements.\n-> ${err.name}: {white ${err.message}}`); });
        }).catch(err => { DBWrn(red`Couldn't send monthly announcements.\n-> ${err.name}: {white ${err.message}}`); });
    } else {
        DBMonth(blueBright("No new monthly announcements."));
        monthlyAnn.send("No new announcements were collected in the last month. (This statistically should not be possible, and may indicate an error in DCM.)");
    }
}

function packageDoc(records: any[], type: "xlsx" | "txt"): string {
    const workbook = xlsx.utils.book_new();
    const jsonWorkSheet = xlsx.utils.json_to_sheet(records);
    xlsx.utils.book_append_sheet(workbook, jsonWorkSheet, "Announcements");
    return xlsx.write(workbook, { type: (type === "txt" ? "string" : "buffer"), bookType: type });
}

function getFiles(records: any[], eChar: string, eDesc: string): Promise<[ ...any ]> {
    return new Promise(async(resolve, _reject) => {
        const document = packageDoc(records, "txt");

        const xlsx = client.dataDir+"/logs/xlsx/"+Date.now()+"--"+eChar+".xlsx";
        const txt = client.dataDir+"/logs/txt/"+Date.now()+"--"+eChar+".txt";
        let xlsxS = "Failed to save.", txtS = "Failed to save.";

        await writeFile(xlsx, packageDoc(records, "xlsx")).then(() => { xlsxS = xlsx; DBFile(green`Saved backup XLSX log file ({white ${xlsx}})`); }).catch(err => { 
            DBFile(red`Couldn't write backup log file. (XLSX)\n-> ${err.name}: {white ${err.message}}`); 
        });

        await writeFile(txt, document).then(() => { txtS = txt; DBFile(green`Saved backup TXT log file ({white ${txt}})`) }).catch(err => { 
            DBFile(red`Couldn't write backup log file. (TXT)\n-> ${err.name}: {white ${err.message}}`); 
        });
        
        const div = document.length / 8388608
        let fileArr = [];

        if(div > 1) {
            for (let i = 0; i < Math.min(roundUp(div), 8); i++) {
                fileArr.push({
                    attachment: document.substring(i * 8388608, (i + 1) * 8388608),
                    name: `Announcements${eChar}${Date.now()}.txt`,
                    description: eDesc,
                });
            }
            
            if(div > 9) {
                fileArr.push({
                    attachment: Buffer.from(`More data was collected than shown, however, due to Discord limits, could not be uploaded.\nXLSX: ${xlsxS}\nTXT: ${txtS}`),
                    name: "Upload limit exceeded.log"
                });
            }
        } else {
            fileArr.push({
                    attachment: Buffer.from(document, "utf8"),
                    name: `Announcements${eChar}${Date.now()}.xlsx`,
                    description: eDesc
                });
        }

        resolve(fileArr);
    });
}

function checkColor(image: any): Promise<boolean> {                                
    return new Promise((resolve, _reject) => {
        const pixels = image.bitmap.width * image.bitmap.height;
        let gsPixels = 0;

        image.scan(0,0,image.bitmap.width,image.bitmap.height,(x:number,y:number,idx:number) => {
            if(image.bitmap.data[idx + 0] === image.bitmap.data[idx + 1] && image.bitmap.data[idx + 0] === image.bitmap.data[idx + 2]) {
                gsPixels++;
            }

            if (x === image.bitmap.width - 1 && y === image.bitmap.height - 1) {
                if(gsPixels === pixels) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            }
        });
    });
}

function roundUp(round: number): number {
    if(Number.isInteger(round)) {
        return round;
    } else {
        return Math.trunc(round+1);
    }
}

async function downloadURI(url: string, name: string, location: string): Promise<string> {
    await mkdir(location).catch(err => { DBWrn(red`Couldn't create download directory.\n-> ${err.name}: {white ${err.message}}`); });
    return new Promise((resolve, reject) => {
        fetch(url).then(res => {
            if(res.status !== 200) { reject(new Error(`${res.status} - ${res.statusText}`)); }
            res.body.pipe(createWriteStream(join(location + "/" + name))).on("finish", () => { resolve(location); }).on("error", (err: Error) => { reject(err); });
        }).catch(err => {
            reject(err);
        });
    });
}

function capitalizeFirstLetter(string: string): string {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getDate(): string {
    const date = new Date();
    return `${date.getFullYear()}-${zeroFill(date.getMonth(), 2)}-${zeroFill(date.getDay(), 2)}`
}

function sleep(timeMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, timeMs));
}

function zeroFill(number: number | string, width: number) {
    width -= number.toString().length;
    if (width > 0)
        return new Array( width + (/\./.test(number as string) ? 2 : 1) ).join( '0' ) + number;
    return number + "";
}