# 🎃 Halloween MMORPG API Documentation

## 📖 Project Overview

**What You're Building:** A client for a real-time multiplayer Halloween-themed game where players can:
- 👥 See each other in the same world 
- 🏃‍♂️ Move around with animated characters
- 🎨 Upload custom character sprites
- 🗺️ Explore a large Halloween-themed world (4096x4096 pixel map)

**Available Assets:**
- ✅ **Hosted Server** - We provide and host the complete backend on `ws://localhost:8080` TODO
- ✅ **API Documentation** - This document explaining server communication
- ✅ **Blank `index.html`** - Empty HTML file to start with
- ✅ **Blank `styles.css`** - Empty CSS file for styling
- ✅ **Default Assets** - Map image (`maps/halloweenmap.png`) and default sprite images (`sprites/default/`)

## 🏗️ Server Architecture

**The Server (Hosted by Us):**
We host and maintain the Node.js server on `ws://localhost:8080` which handles:
- 👥 **Player Management** - Tracking all connected players and their positions
- 🏃‍♂️ **Movement Logic** - Processing movement commands and updating player positions
- 🎨 **Sprite System** - Managing character appearances and custom uploads
- 💾 **Data Persistence** - Saving player data and uploaded sprites to JSON files
- 📡 **Real-time Broadcasting** - Sending updates to all connected clients instantly

**Your Client Architecture:**
```
Your Web Client  ←→  WebSocket  ←→  Provided Server
- HTML5 Canvas     - Real-time     - Manages players  
- User Interface   - Two-way        - Handles movement
- Input handling   - Communication  - Saves game state
```

**Key Concepts:**
- **WebSocket** = Real-time communication channel (instant back-and-forth messaging)
- **Client** = Your application that players interact with (HTML/JavaScript)
- **Server** = Pre-built game engine that handles all the complex logic
- **Broadcasting** = Server automatically notifies all clients when anything changes

## 🏗️ Data Structures

### Player Object
**What it is:** Every player in the game is represented by this object. Think of it as a character sheet in a role-playing game.

```javascript
{
  "id": "abc123def",           // Unique player identifier (like a user ID)
  "x": 2048,                   // Position X (0-4096) - where they are horizontally
  "y": 2048,                   // Position Y (0-4096) - where they are vertically
  "sprite": "wizard",          // Character appearance (what costume they're wearing)
  "facing": "south",           // Direction: north/south/east/west (which way they're looking)
  "isMoving": false,           // Currently walking? (true = legs moving, false = standing still)
  "username": "Player123",     // Display name (shown above their character)
  "targetX": null,             // Click-to-move destination X (where they clicked to walk)
  "targetY": null,             // Click-to-move destination Y (null = not walking anywhere)
  "animationFrame": 0,         // Current animation frame (0-2) - which leg is forward
  "lastAnimationUpdate": 1234567890  // When animation last changed (for timing)
}
```

**Why these fields matter:**
- `x, y` - Like GPS coordinates, tells everyone where to draw this player
- `facing` - Makes character face the right direction when walking
- `isMoving` + `animationFrame` - Creates walking animation (legs moving back and forth)
- `targetX, targetY` - For smooth click-to-move (player walks gradually to clicked spot)

### Sprite Object
**What it is:** A character costume with walking animations. Like a costume in a play, but with different poses for walking in each direction.

```javascript
{
  "name": "wizard",            // Name of this character type
  "frames": {
    "north": ["sprites/wizard/north_1.png", "sprites/wizard/north_2.png"],   // Walking up
    "south": ["sprites/wizard/south_1.png", "sprites/wizard/south_2.png"],   // Walking down
    "east": ["sprites/wizard/east_1.png", "sprites/wizard/east_2.png"],      // Walking right
    "west": ["sprites/wizard/east_1.png", "sprites/wizard/east_2.png"]       // Walking left (flipped east)
  },
  "custom": true  // User-uploaded? (true = player made this, false = came with game)
}
```

**How animation works:**
- Each direction has 1-3 image frames (like a flipbook)
- Game cycles through frames: frame 0 → 1 → 2 → 0 → 1 → 2...
- This creates the illusion of walking (legs moving back and forth)
- West direction reuses east images but flips them horizontally (saves memory)

## 💬 Message Protocol

**How it works:** Your game and the server talk by sending JSON messages back and forth, like text messages.

**Message Pattern:**
- **You → Server**: `{"type": "category", "action": "what_to_do", "data": {...}}`
- **Server → You**: `{"type": "response/update", ...}`

**Think of it like ordering at a restaurant:**
- You: "I want to order food" (your request)
- Server: "Here's your food" or "Sorry, we're out" (response)
- Server to everyone: "New customer just sat down" (broadcast update)

### Core Message Types

#### 🎨 Sprite Messages
**Purpose:** Managing character appearances and costumes

**Get Available Sprites:**
*"Show me all the character costumes I can choose from"*
```javascript
// What you send
{"type": "sprite", "action": "list"}

// What you get back
{"type": "response", "action": "list", "success": true, "data": {"sprites": {...}}}
```

**Upload Custom Sprite:**
*"I designed my own character costume, add it to the game"*
```javascript
// What you send (with your custom character images converted to base64)
{"type": "sprite", "action": "upload", "data": {
  "name": "my_ninja",
  "frames": {
    "north": ["data:image/png;base64,..."],  // Walking up images
    "south": ["data:image/png;base64,..."],  // Walking down images  
    "east": ["data:image/png;base64,..."]    // Walking right images (west will be auto-flipped)
  }
}}

// What you get back
{"type": "response", "action": "upload", "success": true/false, "error": "..."}
```

#### 👤 Player Messages
**Purpose:** Controlling your character in the game world

**Join Game:**
*"I want to enter the game world as a wizard named MyName"*
```javascript
// What you send
{"type": "player", "action": "join", "data": {
  "username": "MyName",    // What name appears above your character
  "sprite": "wizard"       // What character costume you want to wear
}}

// What you get back (the entire game state!)
{"type": "response", "action": "join", "success": true, "data": {
  "playerId": "abc123",           // This is YOUR unique ID
  "worldState": {/* all current players */}  // Everyone currently in the game
}}
```

**Movement (3 different ways to move your character):**
```javascript
// Method 1: Keyboard movement (WASD or arrow keys) - instant movement
{"type": "player", "action": "move", "data": {"direction": "up"}} // up/down/left/right

// Method 2: Click-to-move (click somewhere on map) - smooth walking to destination
{"type": "player", "action": "move", "data": {"x": 1500, "y": 2000}}

// Method 3: Stop moving (halt any current movement)
{"type": "player", "action": "move", "data": {"stop": true}}
```

**Movement explanation:**
- **Keyboard**: Character instantly jumps 15 pixels in that direction
- **Click-to-move**: Character smoothly walks to clicked location (3 pixels per step)
- **Stop**: Useful for halting click-to-move before reaching destination

**Change Appearance:**
*"I want to switch from wizard costume to ninja costume"*
```javascript
// What you send
{"type": "player", "action": "change_sprite", "data": {"sprite": "ninja"}}

// What you get back
{"type": "response", "action": "change_sprite", "success": true}
```
**Result:** Your character instantly changes appearance, everyone sees your new look!

### Broadcast Updates (Server → All Clients)

**What these are:** The server automatically sends these messages to everyone when something happens in the game world. You don't request these - they just arrive when other players do things.

**Think of it like:** A loudspeaker announcement - "Attention everyone, John just entered the building!"

```javascript
// Someone new joined the game
{"type": "update", "category": "player", "action": "joined", "data": {"player": {...}}}

// Someone moved their character  
{"type": "update", "category": "player", "action": "moved", "data": {"player": {...}}}

// Someone changed their character appearance
{"type": "update", "category": "player", "action": "changed_sprite", "data": {"player": {...}}}

// Someone left the game
{"type": "update", "category": "player", "action": "left", "data": {"playerId": "..."}}

// Someone uploaded a new character costume (now everyone can use it)
{"type": "update", "category": "sprite", "action": "added", "data": {"sprite": {...}}}
```

**Important:** Your client should listen for these updates and refresh the display accordingly. This is how multiplayer synchronization works!

## 🌍 Game World Specifications

**World Properties (Handled by Server):**
- **Size**: 4096 × 4096 pixels total game world
- **Boundaries**: Players can move from (0,0) to (4046,4046)
- **Map Background**: `maps/halloweenmap.png` (optional Halloween-themed background)
- **Movement Speed**: 
  - Keyboard = 15px/step (instant movement)
  - Click-to-move = 3px/step (smooth walking)
- **Animation Timing**:
  - 200ms per frame when moving
  - 1000ms per frame when idle

**Error Handling:**
All server errors follow this format:
```javascript
{"type": "response", "action": "...", "success": false, "error": "Error message"}
```

**Common Error Messages:**
- `"Unknown message type"` - Must use "sprite" or "player"
- `"Unknown action"` - Invalid action for the message type
- `"Sprite does not exist"` - Requested sprite name not found
- `"Invalid message format"` - Malformed JSON message

