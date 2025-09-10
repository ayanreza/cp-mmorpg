// Enhanced WebSocket server for Halloween MMORPG with 3-frame animation support
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Create a new WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

// This object will store the state of all players in the game world
const players = {};
const world = {
    width: 4096,
    height: 4096
};

// Sprite database - stores metadata about available sprites with animation frames
const spriteDatabase = {};
const SPRITES_DIR = 'sprites'; // Directory containing sprite folders
const SPRITES_DB_FILE = 'sprites_database.json';

// Define the file path for persistence
const PLAYERS_FILE = 'players.json';

// Store WebSocket connections with player IDs
const connections = new Map();

// --- Sprite Database Functions ---
function initializeSpritesDirectory() {
    if (!fs.existsSync(SPRITES_DIR)) {
        fs.mkdirSync(SPRITES_DIR, { recursive: true });
        console.log(`Created sprites directory: ${SPRITES_DIR}`);
        
        // Create a sample sprite folder structure
        const sampleSprite = path.join(SPRITES_DIR, 'default');
        if (!fs.existsSync(sampleSprite)) {
            fs.mkdirSync(sampleSprite, { recursive: true });
            console.log('Created default sprite folder. Add your sprite animation frames here:');
            console.log('- sprites/default/north_1.png, north_2.png, north_3.png');
            console.log('- sprites/default/south_1.png, south_2.png, south_3.png');
            console.log('- sprites/default/east_1.png, east_2.png, east_3.png');
            console.log('- west frames will use flipped east frames');
        }
    }
}

function loadSpriteDatabase() {
    // Load existing database
    if (fs.existsSync(SPRITES_DB_FILE)) {
        try {
            const data = fs.readFileSync(SPRITES_DB_FILE, 'utf8');
            if (data.trim()) { // Check if file is not empty
                Object.assign(spriteDatabase, JSON.parse(data));
                console.log(`Loaded ${Object.keys(spriteDatabase).length} sprites from database.`);
            } else {
                console.log('Sprite database file is empty, starting fresh.');
            }
        } catch (error) {
            console.error('Failed to load sprite database, starting fresh:', error.message);
        }
    }
    
    // Scan sprites directory for new or updated sprites
    scanSpritesDirectory();
}

function scanSpritesDirectory() {
    if (!fs.existsSync(SPRITES_DIR)) {
        return;
    }
    
    const spriteFolders = fs.readdirSync(SPRITES_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    let newSpritesFound = 0;
    
    for (const spriteName of spriteFolders) {
        const spritePath = path.join(SPRITES_DIR, spriteName);
        const spriteData = {
            name: spriteName,
            frames: {
                north: [],
                south: [],
                east: [],
                west: [] // Will be populated from east frames
            },
            lastModified: fs.statSync(spritePath).mtime.getTime()
        };
        
        // Check if sprite needs updating
        const existingSprite = spriteDatabase[spriteName];
        if (existingSprite && existingSprite.lastModified >= spriteData.lastModified) {
            continue; // Skip unchanged sprites
        }
        
        // Look for directional sprite animation frames
        const directions = ['north', 'south', 'east'];
        let hasValidSprite = false;
        
        for (const direction of directions) {
            // Look for 3 animation frames per direction
            for (let frame = 1; frame <= 3; frame++) {
                const imagePath = path.join(spritePath, `${direction}_${frame}.png`);
                if (fs.existsSync(imagePath)) {
                    spriteData.frames[direction].push(`sprites/${spriteName}/${direction}_${frame}.png`);
                    hasValidSprite = true;
                }
            }
        }
        
        // West frames are copies of east frames (will be flipped on client)
        spriteData.frames.west = [...spriteData.frames.east];
        
        // A sprite is valid if it has at least one frame for north, south, and east
        const hasRequiredSprites = ['north', 'south', 'east'].every(dir => 
            spriteData.frames[dir] && spriteData.frames[dir].length > 0
        );
        
        if (hasRequiredSprites) {
            spriteDatabase[spriteName] = spriteData;
            newSpritesFound++;
            const frameInfo = directions.map(dir => 
                `${dir}:${spriteData.frames[dir].length}`
            ).join(', ');
            console.log(`${existingSprite ? 'Updated' : 'Added'} sprite: ${spriteName} (${frameInfo} frames)`);
        } else {
            console.warn(`Sprite folder "${spriteName}" missing required directions. Need at least 1 frame each: north, south, east`);
        }
    }
    
    if (newSpritesFound > 0) {
        saveSpriteDatabase();
        console.log(`Found ${newSpritesFound} new/updated sprites`);
    }
}

function saveSpriteDatabase() {
    fs.writeFile(SPRITES_DB_FILE, JSON.stringify(spriteDatabase, null, 2), err => {
        if (err) {
            console.error('Failed to save sprite database:', err);
        }
    });
}

function addCustomSprite(spriteName, imageData) {
    // Handle user-uploaded sprite animations
    // imageData structure: { north: [frame1, frame2, frame3], south: [...], east: [...] }
    const spritePath = path.join(SPRITES_DIR, spriteName);
    
    if (!fs.existsSync(spritePath)) {
        fs.mkdirSync(spritePath, { recursive: true });
    }
    
    const spriteData = {
        name: spriteName,
        frames: {
            north: [],
            south: [],
            east: [],
            west: []
        },
        lastModified: Date.now(),
        custom: true
    };
    
    for (const [direction, frameArray] of Object.entries(imageData)) {
        if (['north', 'south', 'east'].includes(direction) && Array.isArray(frameArray)) {
            frameArray.forEach((base64Data, index) => {
                const frameNumber = index + 1;
                const imagePath = path.join(spritePath, `${direction}_${frameNumber}.png`);
                const buffer = Buffer.from(base64Data.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
                fs.writeFileSync(imagePath, buffer);
                spriteData.frames[direction].push(`sprites/${spriteName}/${direction}_${frameNumber}.png`);
            });
        }
    }
    
    // West frames are copies of east frames
    spriteData.frames.west = [...spriteData.frames.east];
    
    spriteDatabase[spriteName] = spriteData;
    saveSpriteDatabase();
    
    // Broadcast new sprite to all connected clients
    broadcastUpdate('sprite', 'added', { sprite: spriteData });
    
    return spriteData;
}

// --- Persistence Functions ---
function saveState() {
    fs.writeFile(PLAYERS_FILE, JSON.stringify(players, null, 2), err => {
        if (err) {
            console.error('Failed to save game state:', err);
        } else {
            console.log('Game state saved.');
        }
    });
}

function loadState() {
    if (fs.existsSync(PLAYERS_FILE)) {
        try {
            const data = fs.readFileSync(PLAYERS_FILE, 'utf8');
            if (data.trim()) { // Check if file is not empty
                Object.assign(players, JSON.parse(data));
                console.log('Game state loaded from file.');
                console.log(`Loaded ${Object.keys(players).length} players from saved state.`);
            } else {
                console.log('Players file is empty, starting with no saved players.');
            }
        } catch (error) {
            console.error('Failed to load game state, starting fresh:', error.message);
        }
    } else {
        console.log('No saved state found. Starting a new game.');
    }
}

// Utility function to clamp a value between min and max
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Calculate distance between two points
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// Move player towards a target position
function movePlayerTowards(player, targetX, targetY, speed = 5) {
    const dist = distance(player.x, player.y, targetX, targetY);
    
    if (dist <= speed) {
        player.x = targetX;
        player.y = targetY;
        player.isMoving = false;
        return true;
    } else {
        const ratio = speed / dist;
        const oldX = player.x;
        const oldY = player.y;
        
        player.x += (targetX - player.x) * ratio;
        player.y += (targetY - player.y) * ratio;
        
        // Update facing direction based on movement
        const deltaX = player.x - oldX;
        const deltaY = player.y - oldY;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            player.facing = deltaX > 0 ? 'east' : 'west';
        } else {
            player.facing = deltaY > 0 ? 'south' : 'north';
        }
        
        player.x = clamp(player.x, 0, world.width - 50);
        player.y = clamp(player.y, 0, world.height - 50);
        player.isMoving = true;
        return false;
    }
}

// Initialize sprite system and load saved state
initializeSpritesDirectory();
loadSpriteDatabase();
loadState();

console.log('Halloween MMORPG Server with Animation Support is running on ws://localhost:8080');
console.log(`World dimensions: ${world.width} x ${world.height}`);
console.log(`Available sprites: ${Object.keys(spriteDatabase).join(', ')}`);

// This function sends a message to all connected clients
function broadcast(data, excludePlayerId = null) {
    connections.forEach((ws, playerId) => {
        if (playerId !== excludePlayerId && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    });
}

// Send message to specific player
function sendToPlayer(playerId, data) {
    const ws = connections.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Helper function to send responses to players
function sendResponse(playerId, action, success, responseData = {}, error = null) {
    const response = {
        type: 'response',
        action: action,
        success: success
    };
    
    if (success) {
        // Spread responseData directly into the response object for cleaner structure
        Object.assign(response, responseData);
    }
    
    if (!success && error !== null) {
        response.error = error;
    }
    
    sendToPlayer(playerId, response);
}

// Helper function to broadcast updates
function broadcastUpdate(category, action, updateData, excludePlayerId = null) {
    const update = {
        type: 'update',
        category: category,
        action: action
    };
    
    // Spread updateData directly into the update object for cleaner structure
    Object.assign(update, updateData);
    
    broadcast(update, excludePlayerId);
}

// Message handler functions for simplified protocol
function handleSpriteMessage(playerId, data) {
    switch (data.action) {
        case 'list':
            sendResponse(playerId, 'list', true, { sprites: spriteDatabase });
            break;
            
        case 'upload':
            try {
                const newSprite = addCustomSprite(data.spriteName, data.spriteFrames);
                sendResponse(playerId, 'upload', true, { sprite: newSprite });
            } catch (error) {
                sendResponse(playerId, 'upload', false, null, error.message);
            }
            break;
            
        default:
            sendResponse(playerId, data.action || 'unknown', false, null, 'Unknown sprite action');
    }
}

function handlePlayerMessage(playerId, data) {
    switch (data.action) {
        case 'join':
            handlePlayerJoin(playerId, data.playerInfo);
            break;
            
        case 'move':
            handlePlayerMove(playerId, data.movement);
            break;
            
        case 'change_sprite':
            handlePlayerChangeSprite(playerId, data.spriteName);
            break;
            
        default:
            sendResponse(playerId, data.action || 'unknown', false, null, 'Unknown player action');
    }
}

function handlePlayerJoin(playerId, playerInfo) {
    if (!players[playerId]) {
        // Validate sprite exists
        const spriteName = playerInfo.sprite && spriteDatabase[playerInfo.sprite] ? playerInfo.sprite : 'default';
        
        players[playerId] = {
            id: playerId,
            x: Math.floor(Math.random() * (world.width - 50)),
            y: Math.floor(Math.random() * (world.height - 50)),
            sprite: spriteName,
            facing: 'south', // Default facing direction
            isMoving: false,
            username: playerInfo.username || `Player${playerId.substr(0, 4)}`,
            targetX: null,
            targetY: null,
            animationFrame: 0, // Current animation frame (0-2)
            lastAnimationUpdate: Date.now()
        };
        console.log(`Player ${playerId} (${players[playerId].username}) joined with sprite "${spriteName}".`);
    } else {
        console.log(`Player ${playerId} (${players[playerId].username}) reconnected.`);
    }
    
    sendResponse(playerId, 'join', true, {
        playerId: playerId,
        worldState: players
    });
    
    broadcastUpdate('player', 'joined', { player: players[playerId] }, playerId);
}

function handlePlayerMove(playerId, movement) {
    const player = players[playerId];
    if (!player) return;
    
    if (movement.stop) {
        // Stop movement
        player.isMoving = false;
        player.targetX = null;
        player.targetY = null;
        player.animationFrame = 0; // Reset to idle frame
        broadcastUpdate('player', 'moved', { player });
    } else if (movement.direction) {
        // WASD movement
        const speed = 15;
        let newX = player.x;
        let newY = player.y;
        let newFacing = player.facing;
        
        switch (movement.direction) {
            case 'up':
                newY = Math.max(0, player.y - speed);
                newFacing = 'north';
                break;
            case 'down':
                newY = Math.min(world.height - 50, player.y + speed);
                newFacing = 'south';
                break;
            case 'left':
                newX = Math.max(0, player.x - speed);
                newFacing = 'west';
                break;
            case 'right':
                newX = Math.min(world.width - 50, player.x + speed);
                newFacing = 'east';
                break;
        }
        
        player.x = newX;
        player.y = newY;
        player.facing = newFacing;
        player.isMoving = true;
        player.targetX = null;
        player.targetY = null;
        
        // Update animation frame when moving
        const now = Date.now();
        if (now - player.lastAnimationUpdate > 200) { // 200ms per frame
            player.animationFrame = (player.animationFrame + 1) % 3;
            player.lastAnimationUpdate = now;
        }
        
        broadcastUpdate('player', 'moved', { player });
    } else if (movement.x !== undefined && movement.y !== undefined) {
        // Click-to-move
        player.targetX = clamp(movement.x - 25, 0, world.width - 50);
        player.targetY = clamp(movement.y - 25, 0, world.height - 50);
        console.log(`Player ${playerId} moving to (${player.targetX}, ${player.targetY})`);
    }
}

function handlePlayerChangeSprite(playerId, spriteName) {
    const player = players[playerId];
    if (player && spriteName && spriteDatabase[spriteName]) {
        player.sprite = spriteName;
        player.animationFrame = 0; // Reset animation frame
        console.log(`Player ${playerId} changed sprite to "${spriteName}"`);
        sendResponse(playerId, 'change_sprite', true);
        broadcastUpdate('player', 'changed_sprite', { player });
    } else {
        sendResponse(playerId, 'change_sprite', false, null, 
            spriteName ? `Sprite "${spriteName}" does not exist` : 'No sprite specified');
    }
}

// Handle new connections to the server
wss.on('connection', ws => {
    const playerId = Math.random().toString(36).substr(2, 9);
    connections.set(playerId, ws);
    console.log(`Player ${playerId} has connected.`);

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'sprite':
                    handleSpriteMessage(playerId, data);
                    break;
                    
                case 'player':
                    handlePlayerMessage(playerId, data);
                    break;
                    
                default:
                    sendResponse(playerId, 'unknown', false, null, `Unknown message type: ${data.type}`);
                    break;
            }
        } catch (error) {
            console.error('Failed to parse message or handle client action:', error);
            sendResponse(playerId, 'error', false, null, 'Invalid message format');
        }
    });

    ws.on('close', () => {
        console.log(`Player ${playerId} has disconnected.`);
        connections.delete(playerId);
        broadcastUpdate('player', 'left', { playerId });
        saveState();
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for player ${playerId}:`, error);
    });
});

// Game loop for handling movement and animations
setInterval(() => {
    let hasUpdates = false;
    const now = Date.now();
    
    for (const playerId in players) {
        const player = players[playerId];
        
        // Handle movement towards target
        if (player.targetX !== null && player.targetY !== null) {
            const reached = movePlayerTowards(player, player.targetX, player.targetY, 3);
            
            if (reached) {
                player.targetX = null;
                player.targetY = null;
                player.isMoving = false;
                player.animationFrame = 0; // Reset to idle frame
            } else {
                // Update animation frame while moving
                if (now - player.lastAnimationUpdate > 200) { // 200ms per frame
                    player.animationFrame = (player.animationFrame + 1) % 3;
                    player.lastAnimationUpdate = now;
                }
            }
            
            hasUpdates = true;
        }
        
        // Handle idle animation (slower cycle)
        else if (!player.isMoving && now - player.lastAnimationUpdate > 1000) { // 1 second per idle frame
            player.animationFrame = (player.animationFrame + 1) % 3;
            player.lastAnimationUpdate = now;
            hasUpdates = true;
        }
    }
    
    if (hasUpdates) {
        for (const playerId in players) {
            const player = players[playerId];
            if (player.targetX !== null || player.targetY !== null || player.isMoving) {
                broadcastUpdate('player', 'moved', { player });
            }
        }
    }
}, 50);

// Periodic state and sprite database saving
setInterval(() => {
    saveState();
    scanSpritesDirectory(); // Check for new sprites periodically
}, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    saveState();
    saveSpriteDatabase();
    process.exit(0);
});