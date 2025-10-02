const mineflayer = require('mineflayer')
const pvp = require('mineflayer-pvp').plugin
const {
    pathfinder,
    Movements,
    goals
} = require('mineflayer-pathfinder')
const armorManager = require('mineflayer-armor-manager')

const cmd = require('mineflayer-cmd').plugin
const fs = require('fs');
let rawdata = fs.readFileSync('config.json');
let data = JSON.parse(rawdata);
var lasttime = -1;
var moving = 0;
var first = false;
var connected = 0;
var actions = ['forward', 'back', 'left', 'right']
var lastaction;
var pi = 3.14159;
var moveinterval = 2; // 2 second movement interval
var maxrandom = 5; // 0-5 seconds added to movement interval (randomly)
var host = data["ip"];
var username = data["name"]
var nightskip = data["auto-night-skip"]

const mc = require('minecraft-protocol')

let bot = null;
let death = 0;
let simp = 0;
let popularity = 0;
let pvpc = 0;

// Expanded fallback version list (newer first)
const versions = [
  "1.20.4",
  "1.20.3",
  "1.20.2",
  "1.20.1",
  "1.19.4",
  "1.19.3",
  "1.19.2",
  "1.19.1",
  "1.18.2",
  "1.18.1",
  "1.18.0",
  "1.17.1",
  "1.16.5",
  "1.12.2",
  "1.8.9"
];

let versionIndex = 0

function startBot(version = false) {
    const currentVersion = version || versions[versionIndex] || false;

    bot = mineflayer.createBot({
        host: host,
        port: data["port"],
        username: username,
        auth: "offline",
        version: currentVersion,
        logErrors: false
    });

    bot.loadPlugin(cmd);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(pathfinder);

    attachEvents();

    bot.on('end', (reason) => {
        addLog(`❌ Bot disconnected (reason: ${reason}, version: ${currentVersion || "auto"}). Retrying...`);
        versionIndex++;
        if (versionIndex >= versions.length) versionIndex = 0;

        // Reset connection state
        connected = 0;
        moving = 0;
        lasttime = -1;
        botOnline = false;
        botStats.moving = false;

        setTimeout(() => {
            addLog("🔄 Attempting to reconnect...");
            tryNextVersion(version);
        }, 3000);
    });

    bot.on('error', err => {
        addLog(`⚠️ Bot error: ${err.message}`);
        // Don't restart on error, let the 'end' event handle it
    });

    bot.on('kicked', (reason) => {
        addLog(`👢 Bot was kicked from server: ${reason}`);
        addLog("🔄 Will attempt to rejoin in 5 seconds...");

        // Reset connection state
        connected = 0;
        moving = 0;
        lasttime = -1;
        botOnline = false;
        botStats.moving = false;

        setTimeout(() => {
            addLog("🔄 Attempting to rejoin after being kicked...");
            tryNextVersion(version);
        }, 5000);
    });
}

function tryNextVersion(current) {
    if (!current) {
        console.log("🚀 Starting bot with first version:", versions[0])
        startBot(versions[0])
    } else {
        let i = versions.indexOf(current)
        let next = versions[(i + 1) % versions.length]
        console.log(`🔄 Switching from version ${current} to ${next}`)
        startBot(next)
    }
}

function attachEvents() {
    bot.on('login', function () {
        addLog("🔐 Attempting to login to server...");
        botOnline = true;
        botStats.version = bot.version;
        
        if (data["login-enabled"] == "true") {
            setTimeout(() => {
                bot.chat(data["login-cmd"])
                addLog("📝 Sent login command");
            }, 1000)
            setTimeout(() => {
                bot.chat(data["register-cmd"])
                addLog("📝 Sent register command");
            }, 3000);
        }
        for (let i = 0; i < 10; i++) {
            task(i);
        }
        addLog("✅ Successfully logged in!");
        setTimeout(() => bot.chat("hello"), 2000);
    });

    function task(i) {
        setTimeout(function () {
            if (first == true) {
                bot.chat("Thanks For Playing CareLessSMP")
                first = false;
            } else {
                bot.chat("Thanks For Playing CareLessSMP")
                first = true;
            }
        }, 3600000 * i);
    }

    bot.on('time', function (time) {
        if (nightskip == "true") {
            if (bot.time.timeOfDay >= 13000) {
                bot.chat('/time set day')
            }
        }
        if (connected < 1) return;
        if (lasttime < 0) {
            lasttime = bot.time.age;
        } else {
            var randomadd = Math.random() * maxrandom * 20;
            var interval = moveinterval * 20 + randomadd;
            if (bot.time.age - lasttime > interval) {
                if (moving == 1) {
                    bot.setControlState(lastaction, false);
                    moving = 0;
                    botStats.moving = false;
                    lasttime = bot.time.age;
                } else {
                    var yaw = Math.random() * pi - (0.5 * pi);
                    var pitch = Math.random() * pi - (0.5 * pi);
                    bot.look(yaw, pitch, false);
                    lastaction = actions[Math.floor(Math.random() * actions.length)];
                    bot.setControlState(lastaction, true);
                    moving = 1;
                    botStats.moving = true;
                    lasttime = bot.time.age;
                    bot.activateItem();
                }
            }
        }
    });

    bot.on('spawn', function () {
        connected = 1;
        addLog("🌍 Bot has spawned in the world and is now active!");
        
        // Update position
        if (bot.entity && bot.entity.position) {
            botStats.position = {
                x: bot.entity.position.x,
                y: bot.entity.position.y,
                z: bot.entity.position.z
            };
            addLog(`📍 Position: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.y.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`);
        }
    });

    bot.on('death', function () {
        death++;
        addLog(`💀 Bot died! Death count: ${death}`);
        addLog("⚰️ Attempting to respawn...");
        botStats.health = 0;
        setTimeout(() => {
            bot.respawn()
        }, 1000)
    });

    // Track health and hunger
    bot.on('health', function () {
        if (bot.health !== undefined) {
            botStats.health = bot.health;
        }
        if (bot.food !== undefined) {
            botStats.hunger = bot.food;
        }
    });

    // Track position changes
    bot.on('move', function () {
        if (bot.entity && bot.entity.position) {
            botStats.position = {
                x: bot.entity.position.x,
                y: bot.entity.position.y,
                z: bot.entity.position.z
            };
            
            // Update look direction
            botStats.lookDirection = {
                yaw: (bot.entity.yaw * 180 / Math.PI) || 0,
                pitch: (bot.entity.pitch * 180 / Math.PI) || 0
            };
            
            updateVisionData();
        }
    });

    // Track entity updates
    bot.on('entitySpawn', function (entity) {
        updateVisionData();
    });

    bot.on('entityGone', function (entity) {
        updateVisionData();
    });

    // Update vision data periodically
    setInterval(() => {
        if (botOnline && bot && bot.entity) {
            updateVisionData();
        }
    }, 1000);

    function updateVisionData() {
        if (!bot || !bot.entity) return;
        
        // Get nearby entities
        const nearbyEntities = Object.values(bot.entities)
            .filter(entity => entity !== bot.entity && entity.position)
            .map(entity => {
                const distance = bot.entity.position.distanceTo(entity.position);
                return {
                    name: entity.username || entity.displayName || entity.name || 'Unknown',
                    type: entity.type || 'unknown',
                    distance: distance,
                    relativeX: (entity.position.x - bot.entity.position.x) / 10, // Normalize for canvas
                    relativeY: (entity.position.z - bot.entity.position.z) / 10,
                    relativeZ: (entity.position.y - bot.entity.position.y) / 10
                };
            })
            .filter(entity => entity.distance < 20) // Only show entities within 20 blocks
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 10); // Limit to 10 entities

        botStats.entities = nearbyEntities;
        botStats.nearestEntity = nearbyEntities.length > 0 ? nearbyEntities[0].name : null;

        // Get nearby blocks (simplified - just some sample blocks for visualization)
        botStats.blocks = [];
        for (let x = -3; x <= 3; x++) {
            for (let z = -3; z <= 3; z++) {
                for (let y = -1; y <= 1; y++) {
                    try {
                        const blockPos = bot.entity.position.offset(x, y, z);
                        const block = bot.blockAt(blockPos);
                        if (block && block.name !== 'air') {
                            botStats.blocks.push({
                                type: block.name,
                                relativeX: x / 3,
                                relativeY: z / 3,
                                relativeZ: y
                            });
                        }
                    } catch (err) {
                        // Ignore errors when getting blocks
                    }
                }
            }
        }
    }

    bot.on('playerCollect', (collector, itemDrop) => {
        if (collector !== bot.entity) return
        setTimeout(() => {
            const sword = bot.inventory.items().find(item => item.name.includes('sword'))
            if (sword) bot.equip(sword, 'hand')
        }, 150)
    })

    bot.on('playerCollect', (collector, itemDrop) => {
        if (collector !== bot.entity) return
        setTimeout(() => {
            const shield = bot.inventory.items().find(item => item.name.includes('shield'))
            if (shield) bot.equip(shield, 'off-hand')
        }, 250)
    })

    let guardPos = null
    function guardArea(pos) {
        guardPos = pos.clone()
        if (!bot.pvp.target) moveToGuardPos()
    }
    function stopGuarding() {
        guardPos = null
        bot.pvp.stop()
        bot.pathfinder.setGoal(null)
    }
    function moveToGuardPos() {
        const mcData = require('minecraft-data')(bot.version)
        bot.pathfinder.setMovements(new Movements(bot, mcData))
        bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z))
    }
    bot.on('stoppedAttacking', () => {
        if (guardPos) moveToGuardPos()
    })
    bot.on('physicTick', () => {
        if (bot.pvp.target) return
        if (bot.pathfinder.isMoving()) return
        const entity = bot.nearestEntity()
        if (entity) bot.lookAt(entity.position.offset(0, entity.height, 0))
    })
    bot.on('physicTick', () => {
        if (!guardPos) return
        const filter = e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 16 &&
            e.mobType !== 'Armor Stand'
        const entity = bot.nearestEntity(filter)
        if (entity) bot.pvp.attack(entity)
    })
    bot.on('chat', (username, message) => {
        if (username === bot.username) return
        if (message === `Hi ${bot.username}` || message === `hi ${bot.username}` || message === `${bot.username} Hi` || message === `${bot.username} hi` || message === `Hello ${bot.username}` || message === `hello ${bot.username}`) {
            popularity++;
            bot.chat(`hi ${username}`)
        }
        if (message === `Hi ${bot.username} i am a girl`) {
            simp++;
            bot.chat(`hi ${username} my girl :smirk:`)
            bot.chat(`hru qt`)
            if (message === `i am fine`) bot.chat(`Oh lets Take The Finest One For A Coffee Today`)
        }
        if (message === `${bot.username} help` || message === `${bot.username} Help` || message === `help ${bot.username}` || message === `Help ${bot.username}`) {
            bot.chat(`hi ${username} Here Are my commands`)
            bot.chat(`===================================`)
            bot.chat(`figth me myname`)
            bot.chat(`Hi myname`)
            bot.chat(`==================================`)
            bot.chat(`Made by @UnknownGuy6666`)
        }
        if (message === `guard ${bot.username}`) {
            const player = bot.players[username]
            if (!player) {
                bot.chat(`I can't see you. ${username} Master!`)
                return
            }
            bot.chat(`I will guard that location.${username}`)
            guardArea(player.entity.position)
        }
        if (message === `fight me ${bot.username}`) {
            const player = bot.players[username]
            if (!player) {
                bot.chat(`I can't see you. Keep Hiding ${username} Loser!`)
                return
            }
            bot.chat(`Prepare to fight! ${username}`)
            pvpc++;
            bot.pvp.attack(player.entity)
        }
        if (message === `stop`) {
            bot.chat('I will no longer guard this area.')
            stopGuarding()
        }
    })
}

// Detect version first
mc.ping({ host: host, port: data["port"] }, (err, res) => {
    if (err) {
        console.log("Ping failed, starting auto-version...")
        startBot(false)
    } else {
        console.log("✅ Server version detected:", res.version.name)
        startBot(res.version.name)
    }
})

const port = process.env.PORT || 5000;

const express = require('express')
const path = require('path')
const app = express()

// Global variables for bot management
let botInstance = null;
let botOnline = false;
let botStartTime = null;
let consoleLogs = ['Bot controller started...'];
let botStats = {
    health: 20,
    hunger: 20,
    position: { x: 0, y: 0, z: 0 },
    moving: false,
    version: null,
    lookDirection: { yaw: 0, pitch: 0 },
    nearestEntity: null,
    blocks: [],
    entities: []
};

// Add log function
function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    consoleLogs.push(`[${timestamp}] ${message}`);
    if (consoleLogs.length > 100) {
        consoleLogs = consoleLogs.slice(-100); // Keep only last 100 logs
    }
    console.log(message);
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve the web interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get bot status
app.get('/api/status', (req, res) => {
    res.json({
        online: botOnline,
        health: botStats.health,
        hunger: botStats.hunger,
        position: botStats.position,
        moving: botStats.moving,
        deaths: death,
        popularity: popularity,
        pvp: pvpc,
        simp: simp,
        server: host,
        username: username,
        version: botStats.version,
        startTime: botStartTime,
        lookDirection: botStats.lookDirection,
        nearestEntity: botStats.nearestEntity,
        blocks: botStats.blocks,
        entities: botStats.entities
    });
});

// API endpoint to get console logs
app.get('/api/logs', (req, res) => {
    res.json({
        logs: consoleLogs.slice(-50) // Return last 50 logs
    });
});

// API endpoint to start bot
app.post('/api/start', (req, res) => {
    if (botOnline) {
        addLog('❌ Bot is already running');
        return res.json({ message: 'Bot is already running' });
    }
    
    addLog('🚀 Starting bot...');
    botStartTime = Date.now();
    startBotFromAPI();
    res.json({ message: 'Starting bot...' });
});

// API endpoint to stop bot
app.post('/api/stop', (req, res) => {
    if (!botOnline) {
        addLog('❌ Bot is not running');
        return res.json({ message: 'Bot is not running' });
    }
    
    addLog('⏹️ Stopping bot...');
    stopBot();
    res.json({ message: 'Stopping bot...' });
});

// API endpoint to rejoin
app.post('/api/rejoin', (req, res) => {
    addLog('🔄 Rejoining server...');
    if (botOnline && botInstance) {
        stopBot();
        setTimeout(() => {
            startBotFromAPI();
        }, 2000);
    } else {
        startBotFromAPI();
    }
    res.json({ message: 'Rejoining server...' });
});

function stopBot() {
    if (botInstance) {
        botInstance.quit();
        botInstance = null;
    }
    botOnline = false;
    botStartTime = null;
    addLog('🛑 Bot stopped');
}

function startBotFromAPI() {
    // Use the existing bot detection logic
    mc.ping({ host: host, port: data["port"] }, (err, res) => {
        if (err) {
            addLog("❌ Ping failed, starting auto-version...");
            startBot(false);
        } else {
            addLog(`✅ Server version detected: ${res.version.name}`);
            startBot(res.version.name);
        }
    });
}

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Bot controller web interface available at http://localhost:${port}`);
    console.log('🤖 MADE BY UnknownGuy6666');
    addLog(`Web interface started on port ${port}`);
})
