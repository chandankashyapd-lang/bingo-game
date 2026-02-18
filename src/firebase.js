// src/firebase.js
// Firebase configuration and real-time game sync utilities

import { initializeApp } from 'firebase/app';
import {
  getDatabase, ref, set, get, update, remove, push,
  onValue, onDisconnect, off, serverTimestamp
} from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// ⚠️ REPLACE with your Firebase config from the Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyCYJj8Ig94wp8aBldJlLulAoTU_N7LMEpo",
  authDomain: "bingo-game-60c17.firebaseapp.com",
  databaseURL: "https://bingo-game-60c17-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bingo-game-60c17",
  storageBucket: "bingo-game-60c17.firebasestorage.app",
  messagingSenderId: "628466671914",
  appId: "1:628466671914:web:931f153cf4409e32fffe53",
  measurementId: "G-T5QN38CT69"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// ─── Auth ───
export function initAuth(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      callback(user);
    } else {
      signInAnonymously(auth).catch(console.error);
    }
  });
}

// ─── Room Management ───

// Generate a 5-char room code
function generateCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Create a new room
export async function createRoom(player) {
  const code = generateCode();
  const roomRef = ref(db, `rooms/${code}`);

  // Check if code already exists (unlikely but possible)
  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    // Retry with new code
    return createRoom(player);
  }

  const roomData = {
    code,
    hostId: player.id,
    phase: 'lobby',
    createdAt: Date.now(),
    players: {
      [player.id]: {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        index: 0,
        online: true,
        isBot: false,
      }
    },
    settings: {
      maxPlayers: 4,
      initTime: 45,
      turnTime: 30,
    },
  };

  await set(roomRef, roomData);

  // Set up disconnect handler
  const playerRef = ref(db, `rooms/${code}/players/${player.id}/online`);
  onDisconnect(playerRef).set(false);

  return code;
}

// Join an existing room
export async function joinRoom(code, player) {
  const roomRef = ref(db, `rooms/${code}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('Room not found');
  }

  const room = snapshot.val();

  if (room.phase !== 'lobby') {
    throw new Error('Game already in progress');
  }

  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= (room.settings?.maxPlayers || 4)) {
    throw new Error('Room is full');
  }

  // Add player to room
  const playerRef = ref(db, `rooms/${code}/players/${player.id}`);
  await set(playerRef, {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    index: playerCount,
    online: true,
    isBot: false,
  });

  // Set up disconnect handler
  const onlineRef = ref(db, `rooms/${code}/players/${player.id}/online`);
  onDisconnect(onlineRef).set(false);

  return room;
}

// Add a bot to the room
export async function addBot(code, botIndex) {
  const botNames = ["Bot Alpha", "Bot Beta", "Bot Gamma"];
  const botAvatars = ["🤖", "🧠", "👾"];
  const botId = `bot_${Date.now()}_${botIndex}`;

  const roomRef = ref(db, `rooms/${code}`);
  const snapshot = await get(roomRef);
  const room = snapshot.val();
  const playerCount = Object.keys(room.players || {}).length;

  if (playerCount >= (room.settings?.maxPlayers || 4)) {
    throw new Error('Room is full');
  }

  const botRef = ref(db, `rooms/${code}/players/${botId}`);
  await set(botRef, {
    id: botId,
    name: botNames[botIndex] || `Bot ${botIndex + 1}`,
    avatar: botAvatars[botIndex] || "🤖",
    index: playerCount,
    online: true,
    isBot: true,
  });

  return botId;
}

// Remove a player from the room
export async function leaveRoom(code, playerId) {
  const playerRef = ref(db, `rooms/${code}/players/${playerId}`);
  await remove(playerRef);

  // Check if room is empty, if so delete it
  const roomRef = ref(db, `rooms/${code}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    const room = snapshot.val();
    if (!room.players || Object.keys(room.players).length === 0) {
      await remove(roomRef);
    }
  }
}

// ─── Game State Management ───

// Start the game — set phase to 'init' and initialize game state
export async function startGame(code, playerIds) {
  const numPlayers = playerIds.length;
  const firstTurn = Math.floor(Math.random() * numPlayers);

  const gameState = {
    phase: 'init',
    currentTurn: firstTurn,
    turnDirection: 1,
    rankings: {},
    finishedPlayers: {},
    lastCalledNumber: null,
    moveHistory: {},
    initStartedAt: Date.now(),
  };

  // Initialize per-player game data (grids set to empty — each player fills their own)
  const playerGameData = {};
  playerIds.forEach((pid, idx) => {
    playerGameData[pid] = {
      grid: Array(25).fill(0), // 0 = empty
      marked: Array(25).fill(false),
      ready: false,
    };
  });

  await update(ref(db, `rooms/${code}`), {
    ...gameState,
    gameData: playerGameData,
  });
}

// Submit player's grid (after filling)
export async function submitGrid(code, playerId, grid) {
  await update(ref(db, `rooms/${code}/gameData/${playerId}`), {
    grid: grid,
    ready: true,
  });
}

// Helper: safely convert Firebase data to array
function toArray(data, length, defaultVal) {
  if (!data) return Array(length).fill(defaultVal);
  if (Array.isArray(data)) return data;
  const arr = Array(length).fill(defaultVal);
  Object.keys(data).forEach((k) => { arr[Number(k)] = data[k]; });
  return arr;
}

// Call a number — marks on all grids, checks for BINGO, advances turn
export async function callNumber(code, callerId, number, allGameData, playerOrder, currentFinished, currentRankings, currentDirection) {
  // Mark the number on all player grids
  const updates = {};
  const newMarked = {};

  playerOrder.forEach((pid) => {
    const pData = allGameData[pid];
    if (!pData) return;
    const grid = toArray(pData.grid, 25, 0);
    const marked = toArray(pData.marked, 25, false);
    for (let i = 0; i < 25; i++) {
      if (grid[i] === number) marked[i] = true;
    }
    updates[`gameData/${pid}/marked`] = marked;
    newMarked[pid] = marked;
  });

  // Check for newly finished players
  const finished = { ...(currentFinished || {}) };
  const rankings = { ...(currentRankings || {}) };
  const newlyFinished = [];
  const rankCount = Object.keys(rankings).length;

  playerOrder.forEach((pid) => {
    if (finished[pid]) return;
    const marked = newMarked[pid];
    if (checkBingo(marked)) newlyFinished.push(pid);
  });

  if (newlyFinished.length > 0) {
    const position = rankCount;
    newlyFinished.forEach((pid) => {
      finished[pid] = true;
      rankings[`pos_${position}_${pid}`] = { playerId: pid, position };
    });
    updates['finishedPlayers'] = finished;
    updates['rankings'] = rankings;
  }

  // Check if game is over (1 or 0 active players remaining)
  const activePlayers = playerOrder.filter((pid) => !finished[pid]);
  let newPhase = null;

  if (activePlayers.length <= 1) {
    // Add remaining player(s) as last
    const lastPos = Object.values(rankings).reduce((max, r) => Math.max(max, r.position), -1) + 1;
    activePlayers.forEach((pid) => {
      rankings[`pos_${lastPos}_${pid}`] = { playerId: pid, position: lastPos };
    });
    updates['rankings'] = rankings;
    updates['phase'] = 'gameover';
    newPhase = 'gameover';
  } else {
    // Snake draft turn advancement
    const callerIndex = playerOrder.indexOf(callerId);
    let dir = currentDirection;
    let nextIdx = callerIndex + dir;

    if (nextIdx < 0 || nextIdx >= playerOrder.length) {
      dir = -dir;
      nextIdx = callerIndex + dir;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= playerOrder.length) nextIdx = playerOrder.length - 1;
    }

    let attempts = 0;
    while (finished[playerOrder[nextIdx]] && attempts < playerOrder.length * 2) {
      nextIdx += dir;
      if (nextIdx < 0 || nextIdx >= playerOrder.length) {
        dir = -dir;
        nextIdx += dir * 2;
        if (nextIdx < 0) nextIdx = 0;
        if (nextIdx >= playerOrder.length) nextIdx = playerOrder.length - 1;
      }
      attempts++;
    }

    updates['currentTurn'] = nextIdx;
    updates['turnDirection'] = dir;
  }

  // Add to move history
  const historyKey = Date.now();
  updates[`moveHistory/${historyKey}`] = { player: callerId, number, timestamp: historyKey };
  updates['lastCalledNumber'] = number;

  await update(ref(db, `rooms/${code}`), updates);

  return { newPhase, newlyFinished };
}

// Helper: check if marked array has >= 5 sequences
function checkBingo(marked) {
  if (!marked) return false;
  let count = 0;
  for (let r = 0; r < 5; r++) {
    let ok = true;
    for (let c = 0; c < 5; c++) if (!marked[r * 5 + c]) { ok = false; break; }
    if (ok) count++;
  }
  for (let c = 0; c < 5; c++) {
    let ok = true;
    for (let r = 0; r < 5; r++) if (!marked[r * 5 + c]) { ok = false; break; }
    if (ok) count++;
  }
  let d1 = true, d2 = true;
  for (let i = 0; i < 5; i++) {
    if (!marked[i * 5 + i]) d1 = false;
    if (!marked[i * 5 + (4 - i)]) d2 = false;
  }
  if (d1) count++;
  if (d2) count++;
  return count >= 5;
}

// Set game phase to 'play'
export async function setPhasePlay(code) {
  await update(ref(db, `rooms/${code}`), { phase: 'play' });
}

// ─── Real-time Listeners ───

// Listen to entire room state
export function subscribeToRoom(code, callback) {
  const roomRef = ref(db, `rooms/${code}`);
  const unsubscribe = onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    } else {
      callback(null);
    }
  });
  return () => off(roomRef);
}

// Clean up room
export async function deleteRoom(code) {
  await remove(ref(db, `rooms/${code}`));
}

// ─── Friend System ───

// Generate a short friend code from UID (6 chars)
function makeFriendCode(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash) + uid.charCodeAt(i);
    hash |= 0;
  }
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  let h = Math.abs(hash);
  for (let i = 0; i < 6; i++) {
    code += chars[h % chars.length];
    h = Math.floor(h / chars.length);
  }
  return code;
}

// Register user profile in Firebase (called once after auth + profile setup)
export async function registerUser(uid, name, avatar) {
  const friendCode = makeFriendCode(uid);
  await update(ref(db, `users/${uid}`), {
    name,
    avatar,
    friendCode,
    online: true,
    lastSeen: Date.now(),
  });
  // Reverse lookup: friendCode → uid
  await set(ref(db, `friendCodes/${friendCode}`), uid);

  // Set up presence
  const onlineRef = ref(db, `users/${uid}/online`);
  const lastSeenRef = ref(db, `users/${uid}/lastSeen`);
  onDisconnect(onlineRef).set(false);
  onDisconnect(lastSeenRef).set(Date.now());

  return friendCode;
}

// Get my friend code
export async function getMyFriendCode(uid) {
  const snap = await get(ref(db, `users/${uid}/friendCode`));
  return snap.exists() ? snap.val() : null;
}

// Add a friend by their friend code
export async function addFriend(myUid, friendCode) {
  // Look up the friend code
  const uidSnap = await get(ref(db, `friendCodes/${friendCode.toUpperCase()}`));
  if (!uidSnap.exists()) {
    throw new Error("Friend code not found");
  }
  const friendUid = uidSnap.val();
  if (friendUid === myUid) {
    throw new Error("That's your own code!");
  }

  // Check if already friends
  const existingSnap = await get(ref(db, `users/${myUid}/friends/${friendUid}`));
  if (existingSnap.exists()) {
    throw new Error("Already friends!");
  }

  // Add friendship both ways
  await set(ref(db, `users/${myUid}/friends/${friendUid}`), true);
  await set(ref(db, `users/${friendUid}/friends/${myUid}`), true);

  return friendUid;
}

// Remove a friend
export async function removeFriend(myUid, friendUid) {
  await remove(ref(db, `users/${myUid}/friends/${friendUid}`));
  await remove(ref(db, `users/${friendUid}/friends/${myUid}`));
}

// Get friend list with profiles
export async function getFriendsList(myUid) {
  const friendsSnap = await get(ref(db, `users/${myUid}/friends`));
  if (!friendsSnap.exists()) return [];

  const friendUids = Object.keys(friendsSnap.val());
  const friends = [];

  for (const fuid of friendUids) {
    const profileSnap = await get(ref(db, `users/${fuid}`));
    if (profileSnap.exists()) {
      const data = profileSnap.val();
      friends.push({
        uid: fuid,
        name: data.name || "Unknown",
        avatar: data.avatar || "🎯",
        online: data.online === true,
        friendCode: data.friendCode || "",
      });
    }
  }
  return friends;
}

// Subscribe to friends list (real-time updates for online status)
export function subscribeToFriends(myUid, callback) {
  const friendsRef = ref(db, `users/${myUid}/friends`);
  const unsubscribe = onValue(friendsRef, async (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const friendUids = Object.keys(snapshot.val());
    const friends = [];

    for (const fuid of friendUids) {
      const profileSnap = await get(ref(db, `users/${fuid}`));
      if (profileSnap.exists()) {
        const data = profileSnap.val();
        friends.push({
          uid: fuid,
          name: data.name || "Unknown",
          avatar: data.avatar || "🎯",
          online: data.online === true,
          friendCode: data.friendCode || "",
        });
      }
    }
    callback(friends);
  });
  return () => off(friendsRef);
}

// Get open friend lobbies (rooms in "lobby" phase hosted by friends)
export async function getFriendLobbies(myUid) {
  const friendsSnap = await get(ref(db, `users/${myUid}/friends`));
  if (!friendsSnap.exists()) return [];

  const friendUids = new Set(Object.keys(friendsSnap.val()));

  // Scan rooms for friend-hosted lobbies
  const roomsSnap = await get(ref(db, `rooms`));
  if (!roomsSnap.exists()) return [];

  const lobbies = [];
  const rooms = roomsSnap.val();

  for (const [code, room] of Object.entries(rooms)) {
    if (room.phase !== "lobby") continue;
    if (!friendUids.has(room.hostId)) continue;

    const playerCount = room.players ? Object.keys(room.players).length : 0;
    const maxPlayers = room.settings?.maxPlayers || 4;
    if (playerCount >= maxPlayers) continue; // Full

    // Get host info
    const hostData = room.players?.[room.hostId];
    lobbies.push({
      code: room.code,
      hostUid: room.hostId,
      hostName: hostData?.name || "Friend",
      hostAvatar: hostData?.avatar || "🎯",
      playerCount,
      maxPlayers,
      createdAt: room.createdAt,
    });
  }

  // Sort by most recent
  lobbies.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return lobbies;
}

// Subscribe to friend lobbies (polls every few seconds via room listener)
export function subscribeToFriendLobbies(myUid, callback) {
  // Listen to all rooms — filter for friend-hosted lobbies
  const roomsRef = ref(db, `rooms`);
  let friendUids = new Set();

  // First get friend list
  get(ref(db, `users/${myUid}/friends`)).then(snap => {
    if (snap.exists()) friendUids = new Set(Object.keys(snap.val()));
  });

  const unsubscribe = onValue(roomsRef, async (snapshot) => {
    // Refresh friend list
    const fSnap = await get(ref(db, `users/${myUid}/friends`));
    if (fSnap.exists()) friendUids = new Set(Object.keys(fSnap.val()));

    if (!snapshot.exists() || friendUids.size === 0) {
      callback([]);
      return;
    }

    const rooms = snapshot.val();
    const lobbies = [];

    for (const [code, room] of Object.entries(rooms)) {
      if (room.phase !== "lobby") continue;
      if (!friendUids.has(room.hostId)) continue;

      const playerCount = room.players ? Object.keys(room.players).length : 0;
      const maxPlayers = room.settings?.maxPlayers || 4;
      if (playerCount >= maxPlayers) continue;

      const hostData = room.players?.[room.hostId];
      lobbies.push({
        code: room.code,
        hostUid: room.hostId,
        hostName: hostData?.name || "Friend",
        hostAvatar: hostData?.avatar || "🎯",
        playerCount,
        maxPlayers,
        createdAt: room.createdAt,
      });
    }

    lobbies.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(lobbies);
  });

  return () => off(roomsRef);
}
