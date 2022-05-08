import { MessageEmbed } from "discord.js";

export function basic(message: string, title?: string): MessageEmbed { 
    const embed = new MessageEmbed()
        .setDescription(message);

    if(title) embed.setTitle(title);
    return embed;
}

export function info(message: string, title?: string): MessageEmbed { return basic(message, title).setColor(0x0078f0);}
export function error(message: string, title?: string): MessageEmbed { return basic(message, title).setColor(0xff3333);}
export function warning(message: string, title?: string): MessageEmbed { return basic(message, title).setColor(0xfffc40);}

export default { error, warning, info, basic };