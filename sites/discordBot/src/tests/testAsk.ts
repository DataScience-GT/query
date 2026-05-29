// src/tests/testAll.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- THE NASTY LIST ---
const edgeCases = [
    "", 
    "   ", 
    "a".repeat(2005), 
    "DROP TABLE users; --", 
    "<script>alert('xss')</script>", 
    "{{7*7}}", 
    "\\u0000", 
    "undefined", 
    "NaN", 
    "unicode_test_accents_and_foreign_chars_汉字", 
    "zalgo_t̹e̖x̗t", 
    "__proto__", // The one that broke 'ask.ts'
    "$$$$$$$$", 
];

class MockInteraction {
    commandName: string;
    optionsMap: Map<string, any>;
    replied: boolean = false;
    deferred: boolean = false;
    logs: string[] = [];
    
    channelId = "channel-123";
    user = { id: "user-999", username: "TestUser", discriminator: "0000" };

    constructor(commandName: string, optionsData: Record<string, any> = {}) {
        this.commandName = commandName;
        this.optionsMap = new Map(Object.entries(optionsData));
    }

    isChatInputCommand() { return true; }
    isButton() { return false; }
    isStringSelectMenu() { return false; }
    
    get options() {
        return {
            getString: (name: string) => this.optionsMap.get(name) ?? null,
            getInteger: (name: string) => this.optionsMap.get(name) ?? 0,
            getBoolean: (name: string) => this.optionsMap.get(name) ?? false,
            getRole: (name: string) => ({ id: "role-123", name: "MockRole", toString: () => "<@&role-123>" }),
            getChannel: (name: string) => this._createMockChannel("channel-target"),
            getUser: (name: string) => this.user,
        };
    }

    // --- 1. MOCK CLIENT (Fixes crashes accessing client.user, client.uptime, etc) ---
    get client() {
        return {
            user: { id: "bot-id", username: "HackBot" },
            uptime: 1000,
            users: {
                cache: {
                    get: (id: string) => ({ id, username: "MockUser" }),
                    has: (id: string) => true
                }
            },
            guilds: {
                cache: {
                    get: (id: string) => this.guild
                }
            }
        };
    }

    // --- 2. MOCK GUILD (Fixes crashes accessing guild.members.cache) ---
    get guild() {
        return {
            id: "guild-001",
            name: "Hacklytics Guild",
            members: {
                cache: {
                    get: (id: string) => ({ id, user: { username: "Member" }, roles: { cache: [] } }),
                    find: (fn: Function) => null,
                    has: (id: string) => true
                },
                // In case command uses .fetch()
                fetch: async (id: string) => ({ id, user: { username: "FetchedMember" } })
            },
            roles: {
                cache: {
                    get: (id: string) => ({ id, name: "some-role" }),
                    find: () => null
                }
            }
        };
    }

    get channel() { return this._createMockChannel("channel-current"); }

    _createMockChannel(id: string) {
        return {
            id,
            name: "general",
            isTextBased: () => true,
            send: async (payload: any) => {
                const content = typeof payload === 'string' ? payload : payload.content;
                this._log(`[CHANNEL_SEND] to #${id}: ${content}`);
                return { id: "msg-123" };
            }
        };
    }

    async deferReply(opts?: any) {
        this.deferred = true;
        this._log(`[DEFER] Ephemeral: ${opts?.ephemeral ?? false}`);
    }

    async reply(response: any) {
        if (this.replied) throw new Error("Double Reply Detected!");
        this.replied = true;
        this._extractContent("REPLY", response);
    }

    async editReply(response: any) {
        this._extractContent("EDIT_REPLY", response);
    }

    async followUp(response: any) {
        this._extractContent("FOLLOW_UP", response);
    }

    async deferUpdate() { this._log("[DEFER_UPDATE]"); }

    _extractContent(type: string, response: any) {
        let text = "";
        if (typeof response === 'string') text = response;
        else if (response?.content) text = response.content;
        else if (response?.embeds?.[0]) text = `[Embed] ${response.embeds[0].data.title}`;
        else text = "[Complex Object]";
        
        this._log(`[${type}] ${text.substring(0, 60).replace(/\n/g, ' ')}...`);
    }

    _log(msg: string) { this.logs.push(msg); }
}

async function runSuite() {
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

    console.log(`\n[SEARCH] Found ${commandFiles.length} commands.\n`);

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const commandName = file.replace('.ts', '');

        console.log(`[TEST] Testing: ${commandName.toUpperCase()}`);
        
        try {
            const module = await import(`file://${filePath}`);
            if (!module.execute) continue;

            const happyInputs = { query: "food", event_name: "Test Event", channel: "announcements", input: "test" };
            await runTest(module, commandName, happyInputs, "[SUCCESS] Happy Path");

            for (const evil of edgeCases) {
                const evilInputs = { query: evil, event_name: evil, start_time: evil, input: evil };
                await runTest(module, commandName, evilInputs, `[FUZZ] Fuzz: "${evil.substring(0,10)}..."`);
            }
        } catch (error) {
            console.error(`   [ERROR] FATAL LOAD ERROR: ${file}`, error);
        }
        console.log("   ----------------------------------------");
    }
}

async function runTest(module: any, name: string, inputs: any, label: string) {
    const mock = new MockInteraction(name, inputs);
    try {
        await module.execute(mock);
        if (mock.logs.length === 0) console.log(`   [WARNING] SILENT | ${label}`);
    } catch (err: any) {
        console.error(`   [ERROR] CRASH | ${label}`);
        console.error(`      Stack: ${err.message.split('\n')[0]}`);
    }
}

runSuite();