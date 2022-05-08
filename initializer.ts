// - Libraries - //
import { Worker } from "node:worker_threads";
import fs      from "node:fs/promises";
import { constants, Dirent } from "fs";
import path    from "node:path/win32";
import { fileURLToPath } from "url";
import typescript from "ts-node";
import chalk   from "chalk";
import debug   from "debug";
import os      from "os";
import "dotenv/config";

type DefObject = {[key: string]: any};
/* - Config Notice - //

"module name 1": { "module content 1": ..., "module content 2": ... },
"module name 2": { "module content 1": ..., "module content 2": ... }
Config file alternatives: 
-- Environment Vars/File: <MODULE NAME_ENV NAME>=<MODULE KEY>

Module Names / Module Keys are case sensitive.

// - Variables - */
const 
      __filename = fileURLToPath(import.meta.url),
      __dirname = path.dirname(__filename),

      modules = path.join(__dirname, "modules"),
      DCMOut = debug("Manager/Main");
let Config: DefObject = {};
// - Application -> Worker Initialization - //
DCMOut(chalk.yellow("Searching for configuration file"));
await fs.readFile(path.join(__dirname, "config.json")).then(async contents => {
    Config = JSON.parse(contents.toString());
    DCMOut(chalk.green`Loaded {white ${await deepSize(Config)}} module variables from configuration file`);
}).catch(async (error: Error) => {
    if(error.message.startsWith("ENOENT")) { DCMOut(chalk.red`Failed to find a configuration file.\n-> ${error.name}: {white ${error.message}}`); }
    else { DCMOut(chalk.red`Failed to parse {white ${path.join(__dirname, "config.json")}}.\n-> ${error.name}: {white ${error.message}}`); }
    DCMOut(chalk.red`-> {yellow Modules will run under variables specified by the environment or .env file.}`);
    for(const [name, value] of Object.entries(process.env)) {
        const spName = name.split("_");
        if(spName[1]) {
            const zero = spName[0].toLowerCase(), one = spName[1].toLowerCase();
            Config[zero] = {};
            Config[zero][one] = value;
        }
    }
    
    DCMOut(chalk.green`Loaded {white ${await deepSize(Config)}} module variables from provided environment`);
});

DCMOut(chalk.yellow("Searching for modules"));
await fs.readdir(modules, {withFileTypes: true}).then(async modDir => {
    for(const entry of modDir) {
        assignWorker(entry, path.join(modules, entry.name));
    }
}).catch((error: Error) => {
    if(error.message.startsWith("ENOENT")) { DCMOut(chalk.red`No module directory exists. Ensure there is one at {white ${modules}} before continuing.`); } 
    else { DCMOut(chalk.red`Failed to open {white modules} directory.\n=> ${error.name}: {white ${error.message}}`); }

    process.exit(1);
});

DCMOut(chalk.green("All modules loaded -- Switching over to status monitoring"));
const DCMStat = debug("Manager/Stat");

setInterval(() => {
    const memProc = process.memoryUsage.rss() / (1024 * 1024), memSys = os.totalmem() / (1024 * 1024), cpuUse = process.cpuUsage();
    DCMStat(chalk.blueBright`Memory Usage: [ {white ${memProc.toFixed(2)}} / {white ${memSys.toFixed(2)}} MB ({white ${(memProc/memSys).toFixed(2)}%}) ] - CPU Usage [ User: {white ${cpuUse.user}}μs / System: {white ${cpuUse.system}}μs ]`);
}, 7500);

function deepSize(object: DefObject, currentSize: number = 0): Promise<number> {
    return new Promise(async(resolve) => {
        for(const [_, value] of Object.entries(object)) {
            if(value != undefined) {
                switch((value as any).constructor.name) {
                    case "Object":
                        currentSize += await deepSize(value);
                        break;
                    case "Array":
                        currentSize += (value as any[]).length;
                        break;
                    default:
                        currentSize += 1;
                }
            }
        }

        resolve(currentSize);
    });
}

function truncate(text: any, length: number) {
    if(text.length > length) { return text.substring(0, length-1) + "…"} 
    else { return text }
}

const TSCompiler = typescript.create(Config.TSRuntime);
function createWorker(entry: Dirent, modulePath: string): Promise<{ worker: Worker, debugger: debug.Debugger }> {
    return new Promise(async(resolve, reject) => {
        let newWorker: Worker, newDebugger: debug.Debugger;

        if(entry.isDirectory()) {
            const DDBName = truncate(`Manager/Modules:${entry.name}`, 50);
            await fs.readFile(path.join(modulePath, "package.json")).then(async contents => {
                const importedPackage = JSON.parse(contents.toString()), modfPath = path.join(modulePath, importedPackage.main);
                if(importedPackage.main) {
                    await fs.access(modfPath, constants.R_OK).then(() => {
                        newWorker = new Worker(path.join(modulePath, importedPackage.main), { env: Config[entry.name] || {}, workerData: { debuggerName: DDBName } });
                    }).catch(err => {
                        reject(chalk.red`Failed to open a worker in {white ${modulePath}}.\n-> ${err.name}: {white ${err.message}}`);
                    });
                } else 
                    reject(chalk.red`{white package.json} in {white ${modulePath}} did not contain a specified entry file. How?`);
            }).catch(async err => {
                if(err.message.startsWith("ENOENT")) {
                    await fs.readdir(modulePath, {withFileTypes: true}).then(async intModDir => {
                        for(const entry of intModDir) 
                            if(entry.isFile() && entry.name.endsWith(".js") || entry.name.endsWith(".cjs") || entry.name.endsWith(".mjs")) {
                                newWorker = new Worker(modulePath, { env: Config[entry.name] || {}, workerData: { debuggerName: DDBName } });
                                break;
                            }
                    });
                } else 
                    reject(chalk.red`Failed to find a {white package.json} in {white ${modulePath}}.\n-> ${err.name}: {white ${err.message}}`);
            });
    
            newDebugger = debug(DDBName + "/Host");
        } else {
            const FDBName = truncate(`Manager/Modules:${entry.name.substring(0, entry.name.lastIndexOf("."))}`, 50);
            if(entry.name.endsWith(".ts")) {
                try {
                    DCMOut(chalk.yellow`Warning: Module {white ${entry.name}} is a TypeScript file. It is recommended to compile it into a JavaScript file before running {white DCM}.`);
                    newWorker = new Worker(
                        TSCompiler.compile((await fs.readFile(modulePath)).toString(), modulePath), 
                        { eval: true, env: Config[entry.name.substring(0, entry.name.lastIndexOf("."))] || {}, workerData: { debuggerName: FDBName } 
                    });
                } catch(error) {
                    if(error instanceof Error) {
                        reject(chalk.red`Failed to compile {white ${entry.name}}.\n-> ${error.name}: {white ${error.message}}`);
                    }
                }
            } else if(entry.name.endsWith(".js") || entry.name.endsWith(".cjs") || entry.name.endsWith(".mjs")) {
                newWorker = new Worker(modulePath, { env: Config[entry.name.substring(0, entry.name.lastIndexOf("."))] || {}, workerData: { debuggerName: FDBName } });
            } else {
                reject(chalk.red`Module {white ${entry.name}} is not a valid file module.`);
            }
            
            newDebugger = debug(FDBName + "/Host");
        }

        resolve({ worker: newWorker!, debugger: newDebugger });
    });
}

function assignWorker(entry: Dirent, modulePath: string, restarts: number = 0): void {
    if(restarts !== 5) {
        createWorker(entry, modulePath).then(obj => {
            obj.worker.on("online", () => {
                obj.debugger(chalk.green`+ Worker {white ${entry.name}} is online`);
            }).on("message", async(message: any) => {
                switch(message) {
                    case "restart":
                        obj.debugger(chalk.yellow`○ Worker {white ${entry.name}} has requested a restart`);
                        await obj.worker!.terminate();
                        assignWorker(entry, modulePath, restarts + 1);
                        break;
                    case "exitAll": 
                        process.abort();
                        break;
                    default:
                        obj.debugger(chalk.blueBright`> Worker {white ${entry.name}} sent an unknown command; {reset %o}`, message);
                }
            }).on("messageerror", (error: Error) => {
                obj.debugger(chalk.red`! Failed to deserialize a message from Worker {white ${entry.name}}.\n! ${error.name}: {white ${error.message}}`);
            }).on("error", (error: Error) => {
                obj.debugger(chalk.red`! Worker {white ${entry.name}} encountered a fatal error.\n! ${error.name}: {white ${error.message}}\n! {white ${error.stack}}`);
            }).on("exit", async(exitCode: number) => {
                obj.debugger(chalk.yellow`- Worker {white ${entry.name}} exited with code {white ${exitCode}}`);
            });
        }).catch(err => {
            DCMOut(err);
        });
    } else {
        DCMOut(chalk.red`Failed to restart Worker {white ${entry.name}} after 5 attempts.`);
    }
}