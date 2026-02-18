import { useState, useEffect, useCallback, useRef } from "react";
import {
  db, auth, initAuth,
  createRoom as fbCreateRoom,
  joinRoom as fbJoinRoom,
  addBot as fbAddBot,
  leaveRoom as fbLeaveRoom,
  startGame as fbStartGame,
  submitGrid as fbSubmitGrid,
  callNumber as fbCallNumber,
  setPhasePlay as fbSetPhasePlay,
  subscribeToRoom,
  deleteRoom as fbDeleteRoom,
  registerUser,
  getMyFriendCode,
  addFriend as fbAddFriend,
  removeFriend as fbRemoveFriend,
  subscribeToFriends,
  subscribeToFriendLobbies,
} from "./firebase";
import { ref, update, get } from "firebase/database";

const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const INIT_TIME = 45;
const TURN_TIME = 30;
const LOBBY_COUNTDOWN = 60;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const BINGO_LETTERS = ["B", "I", "N", "G", "O"];

const POSITION_MEDALS = ["🥇", "🥈", "🥉", "4th"];
const POSITION_LABELS = ["1st", "2nd", "3rd", "4th"];
const POSITION_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32", "#888"];

const AVATARS = ["🎯", "🎲", "🃏", "🏆", "⚡", "🔥", "🌟", "🎪", "🎭", "🎨", "🚀", "💎", "🦊", "🐺", "🦁", "🐲"];

const checkSequences = (marked) => {
  if (!marked) return { count: 0, completed: [] };
  let count = 0;
  const completed = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const idx = Array.from({ length: GRID_SIZE }, (_, c) => r * GRID_SIZE + c);
    if (idx.every((i) => marked[i])) { count++; completed.push(idx); }
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    const idx = Array.from({ length: GRID_SIZE }, (_, r) => r * GRID_SIZE + c);
    if (idx.every((i) => marked[i])) { count++; completed.push(idx); }
  }
  const d1 = Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + i);
  if (d1.every((i) => marked[i])) { count++; completed.push(d1); }
  const d2 = Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + (GRID_SIZE - 1 - i));
  if (d2.every((i) => marked[i])) { count++; completed.push(d2); }
  return { count, completed };
};

const shuffleArray = () => {
  const arr = Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const PLAYER_THEMES = [
  { color: "#E8443A", accent: "#FF6B61", glow: "rgba(232,68,58,0.3)" },
  { color: "#2D7DD2", accent: "#5BA4E8", glow: "rgba(45,125,210,0.3)" },
  { color: "#1B9C85", accent: "#3CC4A7", glow: "rgba(27,156,133,0.3)" },
  { color: "#F39237", accent: "#FFAB5E", glow: "rgba(243,146,55,0.3)" },
];

const STORAGE_KEY = "bingo-profile";

const defaultProfile = () => ({
  name: "", avatar: "🎯",
  gamesPlayed: 0, gamesWon: 0, winStreak: 0, bestStreak: 0, totalSequences: 0,
  createdAt: Date.now(),
});

// ─── Persist profile to localStorage (not Firebase storage) ───
function useLocalProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setProfile(JSON.parse(saved));
    } catch {}
    setLoading(false);
  }, []);

  const updateProfile = useCallback((updater) => {
    setProfile((prev) => {
      const next = typeof updater === "function" ? updater(prev || defaultProfile()) : updater;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { profile, updateProfile, loading };
}

// ─── Shared Styles ───
const cardStyle = {
  background: "rgba(255,255,255,0.04)", borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
};
const labelStyle = {
  fontFamily: "'DM Mono', monospace", fontSize: 11,
  color: "#555", fontWeight: 500, letterSpacing: "0.1em", display: "block", marginBottom: 8,
};
const btnPrimary = {
  width: "100%", padding: "14px", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg, #E8443A, #FF6B61)", color: "#fff",
  fontFamily: "'Fredoka', sans-serif", fontSize: 17, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 4px 20px rgba(232,68,58,0.4)", transition: "transform 0.2s",
};
const btnSecondary = {
  width: "100%", padding: "12px", borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)",
  color: "#ccc", fontFamily: "'Fredoka', sans-serif", fontSize: 15, fontWeight: 600,
  cursor: "pointer", transition: "all 0.2s",
};
const inputStyle = {
  width: "100%", padding: "12px 16px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
  fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#fff",
  outline: "none", boxSizing: "border-box",
};

// ─── Profile Editor ───
function ProfileEditor({ profile, onSave }) {
  const [name, setName] = useState(profile?.name || "");
  const [avatar, setAvatar] = useState(profile?.avatar || "🎯");
  return (
    <div style={{ maxWidth: 440, margin: "0 auto", ...cardStyle, padding: "36px 32px" }}>
      <h2 style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 26, color: "#fff", margin: "0 0 8px", textAlign: "center" }}>
        {profile?.name ? "Edit Profile" : "Create Profile"}
      </h2>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#555", textAlign: "center", margin: "0 0 28px" }}>
        Set your name and avatar
      </p>
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>CHOOSE AVATAR</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {AVATARS.map((a) => (
            <button key={a} onClick={() => setAvatar(a)} style={{
              width: 44, height: 44, borderRadius: 12, border: "none",
              background: avatar === a ? "linear-gradient(135deg, #E8443A, #FF6B61)" : "rgba(255,255,255,0.06)",
              fontSize: 22, cursor: "pointer",
              boxShadow: avatar === a ? "0 4px 16px rgba(232,68,58,0.3)" : "none", transition: "all 0.2s",
            }}>{a}</button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 28 }}>
        <label style={labelStyle}>DISPLAY NAME</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 20))}
          placeholder="Enter your name..." style={inputStyle} />
      </div>
      <button onClick={() => name.trim() && onSave({ ...defaultProfile(), ...profile, name: name.trim(), avatar })}
        disabled={!name.trim()}
        style={{ ...btnPrimary, opacity: name.trim() ? 1 : 0.4 }}>
        {profile?.name ? "Save Changes" : "Let's Play!"}
      </button>
    </div>
  );
}

// ─── Stats Panel ───
function StatsPanel({ profile, onBack }) {
  if (!profile) return null;
  const winRate = profile.gamesPlayed > 0 ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100) : 0;
  const stats = [
    { label: "Games Played", value: profile.gamesPlayed, icon: "🎮" },
    { label: "Games Won", value: profile.gamesWon, icon: "🏆" },
    { label: "Win Rate", value: `${winRate}%`, icon: "📊" },
    { label: "Current Streak", value: profile.winStreak, icon: "🔥" },
    { label: "Best Streak", value: profile.bestStreak, icon: "⚡" },
    { label: "Total Sequences", value: profile.totalSequences, icon: "📐" },
  ];
  return (
    <div style={{ maxWidth: 440, margin: "0 auto", ...cardStyle, padding: "36px 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{profile.avatar}</div>
        <h2 style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 24, color: "#fff", margin: 0 }}>{profile.name}</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff" }}>{s.value}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#666" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <button onClick={onBack} style={btnSecondary}>← Back</button>
    </div>
  );
}

// ─── Player Grid (own card — visible numbers) ───
function MyGrid({ grid, marked, phase, onCellClick, onRandomFill, theme, playerName, playerAvatar, isMyTurn, finishedPosition, manualNext }) {
  const { count: seqCount, completed } = checkSequences(marked);
  const completedCells = new Set(completed.flat());
  const bingoCount = Math.min(seqCount, 5);
  const isFinished = finishedPosition !== null && finishedPosition !== undefined;

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 24, padding: "22px 20px 20px",
      border: `2.5px solid ${isFinished ? "rgba(255,215,0,0.3)" : isMyTurn ? theme.color : "rgba(255,255,255,0.08)"}`,
      boxShadow: isMyTurn ? `0 0 30px ${theme.glow}, 0 12px 40px rgba(0,0,0,0.25)` : "0 8px 32px rgba(0,0,0,0.2)",
      transition: "all 0.4s", maxWidth: 400, width: "100%", margin: "0 auto",
      opacity: isFinished && phase === "play" ? 0.7 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${theme.color}, ${theme.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{playerAvatar}</div>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: "#eee", display: "flex", alignItems: "center", gap: 6 }}>
              {playerName}
              {isFinished && <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: `linear-gradient(135deg, ${POSITION_COLORS[finishedPosition]}, ${POSITION_COLORS[finishedPosition]}dd)`, padding: "2px 8px", borderRadius: 6 }}>{POSITION_MEDALS[finishedPosition]} {POSITION_LABELS[finishedPosition]}</span>}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555" }}>
              {isFinished ? "BINGO! ✓" : phase === "play" ? `${seqCount}/5 sequences` : "Your card"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {BINGO_LETTERS.map((letter, i) => (
            <span key={letter} style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontSize: 22, color: i < bingoCount ? theme.color : "#333", textShadow: i < bingoCount ? `0 0 12px ${theme.glow}` : "none", transition: "all 0.4s", transform: i < bingoCount ? "scale(1.2)" : "scale(1)", display: "inline-block" }}>{letter}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: 5, maxWidth: 340, margin: "0 auto" }}>
        {Array.from({ length: TOTAL_CELLS }).map((_, idx) => {
          const val = grid?.[idx] || 0;
          const isMarked = marked?.[idx];
          const isCompleted = completedCells.has(idx);
          const canClickInit = phase === "init" && val === 0;
          const canClickPlay = phase === "play" && isMyTurn && !isFinished && val > 0 && !isMarked;
          const clickable = canClickInit || canClickPlay;
          return (
            <button key={idx} onClick={() => clickable && onCellClick(idx)} style={{
              aspectRatio: "1", border: "none", borderRadius: 10, fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 17,
              cursor: clickable ? "pointer" : "default", transition: "all 0.2s",
              background: isCompleted ? `linear-gradient(135deg, ${theme.color}, ${theme.accent})` : isMarked ? `${theme.color}20` : val > 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
              color: isCompleted ? "#fff" : isMarked ? theme.color : val > 0 ? "#ccc" : "#333",
              boxShadow: isCompleted ? `0 3px 12px ${theme.glow}` : isMarked ? `inset 0 0 0 2px ${theme.accent}40` : "inset 0 0 0 1px rgba(255,255,255,0.06)",
              outline: canClickInit ? `2px dashed ${theme.accent}50` : "none", outlineOffset: -2,
            }}
              onMouseEnter={(e) => { if (clickable) { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = `0 6px 20px ${theme.glow}`; } }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = isCompleted ? `0 3px 12px ${theme.glow}` : isMarked ? `inset 0 0 0 2px ${theme.accent}40` : "inset 0 0 0 1px rgba(255,255,255,0.06)"; }}>
              {val > 0 ? val : phase === "init" && manualNext <= TOTAL_CELLS ? manualNext : ""}
            </button>
          );
        })}
      </div>
      {phase === "init" && (
        <div style={{ marginTop: 14, display: "flex", gap: 8, maxWidth: 340, margin: "14px auto 0" }}>
          <button onClick={onRandomFill} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${theme.color}, ${theme.accent})`, color: "#fff", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🎲 Random Fill</button>
          <div style={{ padding: "10px 14px", borderRadius: 12, background: `${theme.color}15`, color: theme.color, fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center" }}>Next: {manualNext <= TOTAL_CELLS ? manualNext : "✓"}</div>
        </div>
      )}
    </div>
  );
}

// ─── Opponent Card (hidden numbers) ───
function OpponentCard({ name, avatar, theme, marked, isCurrentTurn, phase, finishedPosition }) {
  const { count: seqCount } = checkSequences(marked);
  const bingoCount = Math.min(seqCount, 5);
  const isFinished = finishedPosition !== null && finishedPosition !== undefined;
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "12px 14px",
      border: `2px solid ${isFinished ? `${POSITION_COLORS[finishedPosition]}40` : isCurrentTurn ? theme.color : "rgba(255,255,255,0.06)"}`,
      boxShadow: isCurrentTurn ? `0 0 16px ${theme.glow}` : "none",
      transition: "all 0.3s", flex: "1 1 160px", minWidth: 150, maxWidth: 220,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${theme.color}, ${theme.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{avatar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 12, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
            {name}
            {isFinished && <span style={{ fontSize: 9, color: "#fff", padding: "1px 5px", borderRadius: 4, background: `linear-gradient(135deg, ${POSITION_COLORS[finishedPosition]}, ${POSITION_COLORS[finishedPosition]}bb)` }}>{POSITION_MEDALS[finishedPosition]}</span>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 3, marginBottom: 8, justifyContent: "center" }}>
        {BINGO_LETTERS.map((letter, i) => (
          <span key={letter} style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontSize: 14, color: i < bingoCount ? theme.color : "#333", textShadow: i < bingoCount ? `0 0 8px ${theme.glow}` : "none" }}>{letter}</span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: 2 }}>
        {(marked || Array(TOTAL_CELLS).fill(false)).map((isMarked, idx) => (
          <div key={idx} style={{ aspectRatio: "1", borderRadius: 3, background: isMarked ? `linear-gradient(135deg, ${theme.color}, ${theme.accent})` : "rgba(255,255,255,0.04)", transition: "background 0.3s" }} />
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#444" }}>
        {isFinished ? `BINGO! ${POSITION_LABELS[finishedPosition]}` : `${seqCount}/5`}
      </div>
    </div>
  );
}

// ─── Leaderboard ───
function Leaderboard({ rankings, playerList, myId }) {
  // rankings from Firebase: { pos_0_pid: {playerId, position}, ... }
  // Convert to grouped format
  const grouped = {};
  Object.values(rankings || {}).forEach((r) => {
    if (!grouped[r.position]) grouped[r.position] = [];
    grouped[r.position].push(r.playerId);
  });
  const sortedPositions = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div style={{ maxWidth: 440, margin: "0 auto 24px", ...cardStyle, padding: "28px 24px" }}>
      <h3 style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 20, color: "#fff", textAlign: "center", margin: "0 0 20px" }}>🏆 Final Standings</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedPositions.map((pos) => (
          <div key={pos} style={{
            display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderRadius: 14,
            background: pos === 0 ? "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,165,0,0.06))" : "rgba(255,255,255,0.03)",
            border: `1px solid ${pos === 0 ? "rgba(255,215,0,0.2)" : "rgba(255,255,255,0.06)"}`,
          }}>
            {grouped[pos].map((pid) => {
              const player = playerList.find((p) => p.id === pid);
              if (!player) return null;
              const theme = PLAYER_THEMES[player.index || 0];
              const isMe = pid === myId;
              return (
                <div key={pid} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 28, width: 44, textAlign: "center", flexShrink: 0 }}>{POSITION_MEDALS[pos] || `${pos + 1}th`}</div>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${theme.color}, ${theme.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{player.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: isMe ? theme.color : "#eee" }}>
                      {player.name}{isMe && <span style={{ color: "#666", fontSize: 10, marginLeft: 6 }}>(you)</span>}
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: POSITION_COLORS[pos] }}>{POSITION_LABELS[pos]} Place{grouped[pos].length > 1 ? " (tied)" : ""}</div>
                  </div>
                  {pos === 0 && <div style={{ fontSize: 20 }}>👑</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN GAME COMPONENT
// ═══════════════════════════════════════════════
export default function BingoGame() {
  const { profile, updateProfile, loading: profileLoading } = useLocalProfile();
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Game state
  const [phase, setPhase] = useState("home"); // home, profile, stats, lobby, init, play, gameover
  const [roomCode, setRoomCode] = useState(null);
  const [roomData, setRoomData] = useState(null); // Full room from Firebase
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState(null);

  // Local init state (grid building — only stored locally until submitted)
  const [localGrid, setLocalGrid] = useState(Array(TOTAL_CELLS).fill(0));
  const [manualNext, setManualNext] = useState(1);

  // Timers
  const [initTimer, setInitTimer] = useState(INIT_TIME);
  const [turnTimer, setTurnTimer] = useState(TURN_TIME);
  const [lobbyCountdown, setLobbyCountdown] = useState(null);
  const [bingoAnnouncement, setBingoAnnouncement] = useState(null);

  const timerRef = useRef(null);
  const turnTimerRef = useRef(null);
  const lobbyTimerRef = useRef(null);
  const autoPlayedRef = useRef(false);
  const unsubRef = useRef(null);
  const prevFinishedRef = useRef({});

  // Friends
  const [myFriendCode, setMyFriendCode] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendLobbies, setFriendLobbies] = useState([]);
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [showFriends, setShowFriends] = useState(false);
  const friendsUnsubRef = useRef(null);
  const lobbiesUnsubRef = useRef(null);

  // ─── Auth ───
  useEffect(() => {
    const unsub = initAuth((user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const myId = authUser?.uid;

  // ─── Register user & set up friend subscriptions ───
  useEffect(() => {
    if (!myId || !profile?.name) return;
    registerUser(myId, profile.name, profile.avatar).then((code) => {
      setMyFriendCode(code);
    }).catch(console.error);
  }, [myId, profile?.name, profile?.avatar]);

  useEffect(() => {
    if (!myId) return;
    friendsUnsubRef.current = subscribeToFriends(myId, setFriends);
    lobbiesUnsubRef.current = subscribeToFriendLobbies(myId, setFriendLobbies);
    return () => {
      if (friendsUnsubRef.current) friendsUnsubRef.current();
      if (lobbiesUnsubRef.current) lobbiesUnsubRef.current();
    };
  }, [myId]);

  // ─── Derived state from roomData ───
  const playerList = roomData?.players
    ? Object.values(roomData.players).sort((a, b) => (a.index || 0) - (b.index || 0))
    : [];
  const playerOrder = playerList.map((p) => p.id);
  const myPlayerIndex = playerList.findIndex((p) => p.id === myId);
  const myTheme = PLAYER_THEMES[myPlayerIndex] || PLAYER_THEMES[0];
  const isHost = roomData?.hostId === myId;
  const fbPhase = roomData?.phase || "lobby";
  const currentTurnIndex = roomData?.currentTurn ?? 0;
  const currentTurnPlayerId = playerOrder[currentTurnIndex];
  const isMyTurn = currentTurnPlayerId === myId;
  // Firebase may convert arrays to objects or null — safely convert back
  const toArray = (data, length, defaultVal) => {
    if (!data) return Array(length).fill(defaultVal);
    if (Array.isArray(data)) return data;
    // Firebase may store as object {0: val, 1: val, ...}
    const arr = Array(length).fill(defaultVal);
    Object.keys(data).forEach((k) => { arr[Number(k)] = data[k]; });
    return arr;
  };

  const myGameData = roomData?.gameData?.[myId];
  const myGrid = toArray(myGameData?.grid, TOTAL_CELLS, 0);
  const myMarked = toArray(myGameData?.marked, TOTAL_CELLS, false);
  const finishedPlayers = roomData?.finishedPlayers || {};
  const rankings = roomData?.rankings || {};
  const moveHistory = roomData?.moveHistory ? Object.values(roomData.moveHistory).sort((a, b) => a.timestamp - b.timestamp) : [];
  const lastCalledNumber = roomData?.lastCalledNumber;

  // Get position for a player
  const getPosition = (pid) => {
    const entry = Object.values(rankings).find((r) => r.playerId === pid);
    return entry ? entry.position : null;
  };

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ─── Subscribe to room ───
  useEffect(() => {
    if (!roomCode) return;
    unsubRef.current = subscribeToRoom(roomCode, (data) => {
      if (!data) {
        cleanup();
        return;
      }
      setRoomData(data);

      const currentPhase = phaseRef.current;

      // Sync phase from Firebase
      if (data.phase === "init" && currentPhase !== "init") {
        setPhase("init");
        phaseRef.current = "init";
        setInitTimer(INIT_TIME);
        setLocalGrid(Array(TOTAL_CELLS).fill(0));
        setManualNext(1);
        gridSubmittedRef.current = false;
        initStartedAtRef.current = null;
      } else if (data.phase === "play" && currentPhase !== "play" && currentPhase !== "gameover") {
        setPhase("play");
        phaseRef.current = "play";
      } else if (data.phase === "gameover" && currentPhase !== "gameover") {
        setPhase("gameover");
        phaseRef.current = "gameover";
        clearInterval(turnTimerRef.current);

        // Update profile stats
        if (myId && data.rankings) {
          const myPos = Object.values(data.rankings).find((r) => r.playerId === myId)?.position;
          const mySeq = checkSequences(data.gameData?.[myId]?.marked).count;
          updateProfile((pr) => ({
            ...pr,
            gamesPlayed: pr.gamesPlayed + 1,
            gamesWon: myPos === 0 ? pr.gamesWon + 1 : pr.gamesWon,
            winStreak: myPos === 0 ? pr.winStreak + 1 : 0,
            bestStreak: myPos === 0 ? Math.max(pr.bestStreak, pr.winStreak + 1) : pr.bestStreak,
            totalSequences: pr.totalSequences + mySeq,
          }));
        }
      }

      // Detect new BINGO announcements
      if (data.finishedPlayers) {
        const prev = prevFinishedRef.current;
        const newFinishers = Object.keys(data.finishedPlayers).filter((pid) => !prev[pid]);
        if (newFinishers.length > 0 && data.phase !== "gameover") {
          const names = newFinishers.map((pid) => {
            const p = Object.values(data.players || {}).find((pl) => pl.id === pid);
            return p?.name || "Player";
          }).join(" & ");
          const pos = Object.values(data.rankings || {}).find((r) => newFinishers.includes(r.playerId))?.position ?? 0;
          setBingoAnnouncement({ names, position: pos });
          setTimeout(() => setBingoAnnouncement(null), 3000);
        }
        prevFinishedRef.current = { ...data.finishedPlayers };
      }

      // Host: auto-detect when all players have submitted grids → move to play
      if (data.phase === "init" && data.hostId === myId && data.gameData && data.players) {
        const pids = Object.values(data.players).map((p) => p.id);
        const allReady = pids.length >= MIN_PLAYERS && pids.every((pid) => data.gameData[pid]?.ready === true);
        if (allReady) {
          fbSetPhasePlay(roomCode).catch(console.error);
        }
      }
    });

    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [roomCode]);

  // ─── Lobby countdown ───
  useEffect(() => {
    if (phase !== "lobby" || !roomData || playerList.length < MIN_PLAYERS) {
      clearInterval(lobbyTimerRef.current);
      return;
    }
    if (lobbyCountdown === null && playerList.length >= MIN_PLAYERS) {
      setLobbyCountdown(LOBBY_COUNTDOWN);
    }
  }, [playerList.length, phase]);

  useEffect(() => {
    if (lobbyCountdown === null || phase !== "lobby") return;
    lobbyTimerRef.current = setInterval(() => {
      setLobbyCountdown((t) => {
        if (t <= 1) { clearInterval(lobbyTimerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(lobbyTimerRef.current);
  }, [lobbyCountdown !== null, phase]);

  useEffect(() => {
    if (lobbyCountdown === 0 && phase === "lobby" && isHost && playerList.length >= MIN_PLAYERS) {
      handleStartGame();
    }
  }, [lobbyCountdown]);

  // ─── Init timer (synced from Firebase initStartedAt) ───
  const initStartedAtRef = useRef(null);
  useEffect(() => {
    if (phase !== "init" || !roomData?.initStartedAt) return;
    // Only set up timer once per init phase
    if (initStartedAtRef.current === roomData.initStartedAt) return;
    initStartedAtRef.current = roomData.initStartedAt;
    const startedAt = roomData.initStartedAt;

    clearInterval(timerRef.current);
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, INIT_TIME - elapsed);
      setInitTimer(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        if (!gridSubmittedRef.current) {
          handleRandomFillRef.current();
        }
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, roomData?.initStartedAt]);

  // ─── Turn timer ───
  useEffect(() => {
    clearInterval(turnTimerRef.current);
    autoPlayedRef.current = false;
    if (phase !== "play" || !currentTurnPlayerId) return;
    if (finishedPlayers[currentTurnPlayerId]) return;

    // For bots, the host executes their turn
    const currentPlayer = playerList.find((p) => p.id === currentTurnPlayerId);
    if (currentPlayer?.isBot && isHost) {
      setTimeout(() => executeBotTurn(currentTurnPlayerId), 800 + Math.random() * 1200);
      return;
    }

    // For human players, run the 30s countdown
    if (!currentPlayer?.isBot) {
      setTurnTimer(TURN_TIME);
      turnTimerRef.current = setInterval(() => {
        setTurnTimer((t) => {
          if (t <= 1) { clearInterval(turnTimerRef.current); return 0; }
          return t - 1;
        });
      }, 1000);
    }

    return () => clearInterval(turnTimerRef.current);
  }, [currentTurnPlayerId, phase, fbPhase]);

  // Auto-pick when turn timer hits 0
  useEffect(() => {
    if (turnTimer !== 0 || phase !== "play" || autoPlayedRef.current) return;
    if (!isMyTurn || finishedPlayers[myId]) return;
    autoPlayedRef.current = true;

    const unmarked = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!myMarked[i] && myGrid[i] > 0) unmarked.push(i);
    }
    if (unmarked.length === 0) return;
    const chosen = unmarked[Math.floor(Math.random() * unmarked.length)];
    handleCallNumber(myGrid[chosen]);
  }, [turnTimer, phase, isMyTurn]);

  // ─── Actions ───
  const handleCreateRoom = async () => {
    try {
      setError(null);
      const code = await fbCreateRoom({ id: myId, name: profile.name, avatar: profile.avatar });
      setRoomCode(code);
      setPhase("lobby");
      setLobbyCountdown(null);
    } catch (e) { setError(e.message); }
  };

  // ─── Friend Actions ───
  const handleAddFriend = async () => {
    try {
      setError(null);
      await fbAddFriend(myId, friendCodeInput.toUpperCase());
      setFriendCodeInput("");
    } catch (e) { setError(e.message); }
  };

  const handleRemoveFriend = async (friendUid) => {
    try {
      await fbRemoveFriend(myId, friendUid);
    } catch (e) { setError(e.message); }
  };

  const handleJoinFriendLobby = async (code) => {
    await handleJoinRoom(code);
  };

  const handleJoinRoom = async (code) => {
    try {
      setError(null);
      const upperCode = code.toUpperCase();
      await fbJoinRoom(upperCode, { id: myId, name: profile.name, avatar: profile.avatar });
      setRoomCode(upperCode);
      setPhase("lobby");
    } catch (e) { setError(e.message); }
  };

  const handleAddBot = async () => {
    try {
      const botIndex = playerList.filter((p) => p.isBot).length;
      await fbAddBot(roomCode, botIndex);
    } catch (e) { setError(e.message); }
  };

  const handleStartGame = async () => {
    try {
      clearInterval(lobbyTimerRef.current);
      await fbStartGame(roomCode, playerOrder);
    } catch (e) { setError(e.message); }
  };

  // Init: place number manually
  const handleInitCellClick = (cellIdx) => {
    if (localGrid[cellIdx] !== 0 || manualNext > TOTAL_CELLS || gridSubmittedRef.current) return;
    const newGrid = [...localGrid];
    newGrid[cellIdx] = manualNext;
    setLocalGrid(newGrid);
    const nextNum = manualNext + 1;
    setManualNext(nextNum);

    if (nextNum > TOTAL_CELLS) {
      gridSubmittedRef.current = true;
      clearInterval(timerRef.current);
      fbSubmitGrid(roomCode, myId, newGrid).then(() => {
        checkAllReady();
      }).catch((e) => {
        console.error("Submit grid error:", e);
        gridSubmittedRef.current = false;
      });
    }
  };

  const gridSubmittedRef = useRef(false);
  const handleRandomFillRef = useRef(null);

  const handleRandomFill = useCallback(() => {
    if (gridSubmittedRef.current) return;
    gridSubmittedRef.current = true;

    setLocalGrid((prevGrid) => {
      const newGrid = [...prevGrid];
      const placed = new Set(newGrid.filter((v) => v > 0));
      const remaining = [];
      for (let n = 1; n <= TOTAL_CELLS; n++) if (!placed.has(n)) remaining.push(n);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      let ri = 0;
      for (let i = 0; i < TOTAL_CELLS; i++) if (newGrid[i] === 0) newGrid[i] = remaining[ri++];

      setManualNext(TOTAL_CELLS + 1);
      clearInterval(timerRef.current);

      fbSubmitGrid(roomCode, myId, newGrid)
        .then(() => checkAllReady())
        .catch((e) => {
          console.error("Submit grid error:", e);
          gridSubmittedRef.current = false;
        });

      return newGrid;
    });
  }, [roomCode, myId]);

  // Keep ref updated so timer can call latest version
  useEffect(() => { handleRandomFillRef.current = handleRandomFill; }, [handleRandomFill]);

  // Check if all players have submitted grids → move to play phase
  const checkAllReady = async () => {
    // Delay to let Firebase sync all writes
    setTimeout(async () => {
      try {
        const roomSnap = await get(ref(db, `rooms/${roomCode}`));
        const room = roomSnap.val();
        if (!room || room.phase !== "init") return;

        const players = room.players ? Object.values(room.players).sort((a, b) => (a.index || 0) - (b.index || 0)) : [];
        const pids = players.map((p) => p.id);
        const gameData = room.gameData || {};
        const amHost = room.hostId === myId;

        const allReady = pids.every((pid) => gameData[pid]?.ready === true);

        if (allReady && amHost) {
          await fbSetPhasePlay(roomCode);
        }
      } catch (e) {
        console.error("checkAllReady error:", e);
      }
    }, 1000);
  };

  // Host auto-fills bot grids on init
  useEffect(() => {
    if (phase !== "init" || !isHost) return;
    const fillBots = async () => {
      for (const player of playerList) {
        if (player.isBot) {
          await fbSubmitGrid(roomCode, player.id, shuffleArray());
        }
      }
      // After bots are filled, check if all ready (in case human was already done)
      checkAllReady();
    };
    fillBots();
  }, [phase, isHost]);

  // Call a number
  const handleCallNumber = async (number) => {
    if (!roomCode || !roomData) return;
    clearInterval(turnTimerRef.current);
    try {
      await fbCallNumber(
        roomCode, myId, number,
        roomData.gameData, playerOrder,
        finishedPlayers, rankings,
        roomData.turnDirection || 1
      );
    } catch (e) { console.error("Call number error:", e); }
  };

  const handlePlayCellClick = (cellIdx) => {
    if (!isMyTurn || phase !== "play" || finishedPlayers[myId]) return;
    const number = myGrid[cellIdx];
    if (!number || number === 0 || myMarked[cellIdx]) return;
    handleCallNumber(number);
  };

  // Bot turn — host executes
  const executeBotTurn = async (botId) => {
    if (!roomData?.gameData?.[botId]) return;
    const botData = roomData.gameData[botId];
    const botGrid = botData.grid || [];
    const botMarked = botData.marked || Array(TOTAL_CELLS).fill(false);

    const unmarked = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (!botMarked[i] && botGrid[i] > 0) unmarked.push(i);
    }
    if (unmarked.length === 0) return;
    const chosen = unmarked[Math.floor(Math.random() * unmarked.length)];
    const number = botGrid[chosen];

    try {
      await fbCallNumber(
        roomCode, botId, number,
        roomData.gameData, playerOrder,
        finishedPlayers, rankings,
        roomData.turnDirection || 1
      );
    } catch (e) { console.error("Bot turn error:", e); }
  };

  const handleCellClick = (cellIdx) => {
    if (phase === "init") handleInitCellClick(cellIdx);
    else if (phase === "play") handlePlayCellClick(cellIdx);
  };

  const cleanup = () => {
    setPhase("home"); phaseRef.current = "home";
    setRoomCode(null); setRoomData(null);
    setLobbyCountdown(null); setError(null);
    setBingoAnnouncement(null); prevFinishedRef.current = {};
    clearInterval(timerRef.current);
    clearInterval(turnTimerRef.current);
    clearInterval(lobbyTimerRef.current);
    if (unsubRef.current) unsubRef.current();
  };

  const handleLeave = async () => {
    if (roomCode && myId) {
      try { await fbLeaveRoom(roomCode, myId); } catch {}
    }
    cleanup();
  };

  const handleRematch = async () => {
    if (isHost && roomCode) {
      try { await fbStartGame(roomCode, playerOrder); } catch (e) { console.error(e); }
    }
  };

  // Show profile if none
  useEffect(() => {
    if (!profileLoading && !authLoading && !profile?.name && phase === "home") setPhase("profile");
  }, [profileLoading, authLoading, profile, phase]);

  // ─── RENDER ───
  if (profileLoading || authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #0d0d1a 0%, #1a1a2e 50%, #0d0d1a 100%)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 36, background: "linear-gradient(135deg, #E8443A, #2D7DD2, #1B9C85, #F39237)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "pulse 1.5s infinite" }}>BINGO</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#555", marginTop: 8 }}>Connecting...</div>
        </div>
      </div>
    );
  }

  // Current display grid for init phase (local) vs play phase (firebase)
  const displayGrid = phase === "init" ? localGrid : myGrid;
  const displayMarked = phase === "init" ? Array(TOTAL_CELLS).fill(false) : myMarked;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0d0d1a 0%, #1a1a2e 50%, #12122a 100%)", fontFamily: "'Inter', sans-serif", padding: "20px 12px", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 900, margin: "0 auto 20px", padding: "0 4px" }}>
        <h1 onClick={() => { if (phase === "home" || phase === "profile" || phase === "stats") return; handleLeave(); }} style={{
          fontFamily: "'Fredoka', sans-serif", fontSize: 32, fontWeight: 700,
          background: "linear-gradient(135deg, #E8443A, #FF6B61, #F39237)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          margin: 0, letterSpacing: "0.06em", cursor: "pointer",
        }}>BINGO</h1>
        {profile?.name && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setPhase("stats")} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#ccc" }}>📊</button>
            <button onClick={() => setPhase("profile")} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#ccc" }}>
              <span style={{ fontSize: 16 }}>{profile.avatar}</span> {profile.name}
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ maxWidth: 420, margin: "0 auto 16px", padding: "10px 16px", borderRadius: 12, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", textAlign: "center" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#ef4444" }}>{error}</div>
          <button onClick={() => setError(null)} style={{ marginTop: 6, background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer" }}>dismiss</button>
        </div>
      )}

      {/* BINGO Toast */}
      {bingoAnnouncement && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 1000, padding: "14px 28px", borderRadius: 16, background: "linear-gradient(135deg, rgba(255,215,0,0.95), rgba(255,165,0,0.95))", boxShadow: "0 8px 32px rgba(255,215,0,0.4)", animation: "slideIn 0.4s ease-out" }}>
          <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 18, fontWeight: 700, color: "#1a1a2e", textAlign: "center" }}>
            {POSITION_MEDALS[bingoAnnouncement.position]} {bingoAnnouncement.names} got BINGO!
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#555", marginTop: 2 }}>{POSITION_LABELS[bingoAnnouncement.position]} place</div>
          </div>
        </div>
      )}

      {/* ─── Profile ─── */}
      {phase === "profile" && <ProfileEditor profile={profile} onSave={(p) => { updateProfile(p); setPhase("home"); }} />}

      {/* ─── Stats ─── */}
      {phase === "stats" && <StatsPanel profile={profile} onBack={() => setPhase("home")} />}

      {/* ─── Home ─── */}
      {phase === "home" && (
        <div style={{ maxWidth: 420, margin: "40px auto" }}>
          <div style={{ ...cardStyle, padding: "40px 32px", marginBottom: 16 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>🎯</div>
              <h2 style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 26, color: "#fff", margin: "0 0 6px" }}>Ready to play?</h2>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#555" }}>Create a room or join a friend's game</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button onClick={handleCreateRoom} style={btnPrimary}>Create Room 🏠</button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#444" }}>or join</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" value={joinInput} onChange={(e) => setJoinInput(e.target.value.toUpperCase().slice(0, 5))}
                  placeholder="ROOM CODE" style={{ ...inputStyle, flex: 1, textAlign: "center", letterSpacing: "0.2em", fontSize: 18 }} />
                <button onClick={() => handleJoinRoom(joinInput)} disabled={joinInput.length < 5}
                  style={{ ...btnSecondary, width: "auto", padding: "12px 20px", opacity: joinInput.length >= 5 ? 1 : 0.4 }}>Join</button>
              </div>
            </div>
          </div>

          {/* ── Friend Lobbies ── */}
          {friendLobbies.length > 0 && (
            <div style={{ ...cardStyle, padding: "20px 24px", marginBottom: 16, border: "1px solid rgba(74,222,128,0.15)" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4ade80", letterSpacing: "0.12em", marginBottom: 12 }}>🟢 FRIENDS PLAYING NOW</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {friendLobbies.map((lobby) => (
                  <div key={lobby.code} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12,
                    background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.12)",
                  }}>
                    <div style={{ fontSize: 22, flexShrink: 0 }}>{lobby.hostAvatar}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "#eee", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lobby.hostName}'s Room</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#666" }}>{lobby.playerCount}/{lobby.maxPlayers} players • {lobby.code}</div>
                    </div>
                    <button onClick={() => handleJoinFriendLobby(lobby.code)} style={{
                      padding: "8px 16px", borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg, #4ade80, #22c55e)", color: "#0d0d1a",
                      fontFamily: "'Fredoka', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>Join</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Friends Panel ── */}
          <div style={{ ...cardStyle, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, cursor: "pointer" }} onClick={() => setShowFriends(!showFriends)}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#888", letterSpacing: "0.12em" }}>
                👥 FRIENDS ({friends.length})
              </div>
              <span style={{ fontSize: 12, color: "#555" }}>{showFriends ? "▲" : "▼"}</span>
            </div>

            {showFriends && (
              <>
                {/* My Friend Code */}
                {myFriendCode && (
                  <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(45,125,210,0.08)", border: "1px solid rgba(45,125,210,0.15)", textAlign: "center" }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#5BA4E8", letterSpacing: "0.1em", marginBottom: 4 }}>YOUR FRIEND CODE</div>
                    <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "0.12em", cursor: "pointer", userSelect: "all" }}
                      onClick={() => { try { navigator.clipboard.writeText(myFriendCode); } catch {} }}>
                      {myFriendCode}
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#444", marginTop: 2 }}>Click to copy • Share with friends</div>
                  </div>
                )}

                {/* Add Friend */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <input type="text" value={friendCodeInput} onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                    placeholder="FRIEND CODE" style={{ ...inputStyle, flex: 1, textAlign: "center", letterSpacing: "0.15em", fontSize: 14, padding: "8px 12px" }} />
                  <button onClick={handleAddFriend} disabled={friendCodeInput.length < 6}
                    style={{ ...btnSecondary, width: "auto", padding: "8px 16px", fontSize: 12, opacity: friendCodeInput.length >= 6 ? 1 : 0.4 }}>Add</button>
                </div>

                {/* Friend List */}
                {friends.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px 0", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#444" }}>
                    No friends yet. Share your code!
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {friends.map((f) => (
                      <div key={f.uid} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
                        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ fontSize: 20, flexShrink: 0 }}>{f.avatar}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#eee", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: f.online ? "#4ade80" : "#666" }}>
                            {f.online ? "● Online" : "○ Offline"}
                          </div>
                        </div>
                        <button onClick={() => handleRemoveFriend(f.uid)} style={{
                          background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer", padding: "4px",
                        }} title="Remove friend">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Lobby ─── */}
      {phase === "lobby" && roomData && (
        <>
          <div style={{ maxWidth: 480, margin: "0 auto", ...cardStyle, padding: "32px 28px" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.15em", marginBottom: 8 }}>ROOM CODE</div>
              <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 48, fontWeight: 700, letterSpacing: "0.15em", color: "#fff", background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: "12px 24px", display: "inline-block", border: "2px dashed rgba(255,255,255,0.15)", userSelect: "all", cursor: "pointer" }}
                onClick={() => { try { navigator.clipboard.writeText(roomCode); } catch {} }}>
                {roomCode}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#444", marginTop: 8 }}>Share this code with friends</div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>PLAYERS ({playerList.length}/{MAX_PLAYERS})</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {playerList.map((p, i) => (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12,
                    background: p.id === myId ? `${PLAYER_THEMES[i].color}15` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${p.id === myId ? `${PLAYER_THEMES[i].color}30` : "rgba(255,255,255,0.06)"}`,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${PLAYER_THEMES[i].color}, ${PLAYER_THEMES[i].accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{p.avatar}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#eee", fontWeight: 600 }}>
                        {p.name}{p.id === myId && <span style={{ color: "#666", fontSize: 10, marginLeft: 6 }}>(you)</span>}
                      </div>
                      {i === 0 && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: PLAYER_THEMES[0].color }}>HOST</span>}
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.online !== false ? "#4ade80" : "#666", boxShadow: p.online !== false ? "0 0 8px rgba(74,222,128,0.5)" : "none" }} />
                  </div>
                ))}
                {Array.from({ length: MAX_PLAYERS - playerList.length }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#333" }}>?</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#333" }}>Waiting...</div>
                  </div>
                ))}
              </div>
            </div>

            {playerList.length >= MIN_PLAYERS && lobbyCountdown !== null && (
              <div style={{ textAlign: "center", marginBottom: 20, padding: "14px 16px", borderRadius: 14, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4ade80", marginBottom: 4 }}>GAME STARTING IN</div>
                <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 36, fontWeight: 700, color: lobbyCountdown <= 10 ? "#E8443A" : "#fff" }}>{lobbyCountdown}s</div>
              </div>
            )}

            {playerList.length < MIN_PLAYERS && (
              <div style={{ textAlign: "center", marginBottom: 20, padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#666" }}>⏳ Need at least <strong style={{ color: "#ccc" }}>2 players</strong> to start</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              {isHost && playerList.length >= MIN_PLAYERS && (
                <button onClick={handleStartGame} style={{ ...btnPrimary, flex: 2 }}>Start Now 🚀</button>
              )}
              <button onClick={handleLeave} style={{ ...btnSecondary, flex: 1 }}>Leave</button>
            </div>
          </div>

          {isHost && playerList.length < MAX_PLAYERS && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={handleAddBot} style={{ ...btnSecondary, width: "auto", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px" }}>🤖 Add Bot</button>
            </div>
          )}
        </>
      )}

      {/* ─── Init ─── */}
      {phase === "init" && roomData && (
        <>
          <div style={{ textAlign: "center", marginBottom: 18, background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "14px 20px", maxWidth: 420, margin: "0 auto 18px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 16, color: "#fff" }}>Set up your card!</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 36, fontWeight: 700, color: initTimer <= 10 ? "#E8443A" : "#fff", margin: "4px 0" }}>{initTimer}s</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555" }}>Click cells to place numbers or use Random Fill</div>
            <div style={{ marginTop: 10, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, background: initTimer <= 10 ? "linear-gradient(90deg, #E8443A, #FF6B61)" : `linear-gradient(90deg, ${myTheme.color}, ${myTheme.accent})`, width: `${(initTimer / INIT_TIME) * 100}%`, transition: "width 1s linear" }} />
            </div>
          </div>
          <MyGrid grid={displayGrid} marked={displayMarked} phase="init" onCellClick={handleCellClick}
            onRandomFill={handleRandomFill} theme={myTheme} playerName={profile?.name || "You"}
            playerAvatar={profile?.avatar || "🎯"} isMyTurn={true} finishedPosition={null} manualNext={manualNext} />
        </>
      )}

      {/* ─── Play ─── */}
      {phase === "play" && roomData && (
        <>
          <div style={{
            textAlign: "center", marginBottom: 16, background: "rgba(255,255,255,0.05)", borderRadius: 16,
            padding: "12px 20px", maxWidth: 420, margin: "0 auto 16px",
            border: `1px solid ${isMyTurn && !finishedPlayers[myId] ? `${myTheme.color}40` : "rgba(255,255,255,0.08)"}`,
          }}>
            {finishedPlayers[myId] ? (
              <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 16, fontWeight: 700, color: "#FFD700" }}>
                {POSITION_MEDALS[getPosition(myId)]} You finished {POSITION_LABELS[getPosition(myId)]}! Waiting for others...
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 16, fontWeight: 700, color: isMyTurn ? myTheme.color : "#888" }}>
                  {isMyTurn ? "🎯 Your Turn — Pick a number!" : `⏳ ${playerList.find((p) => p.id === currentTurnPlayerId)?.name || "..."}'s turn...`}
                </div>
                {!playerList.find((p) => p.id === currentTurnPlayerId)?.isBot && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700, color: turnTimer <= 10 ? "#E8443A" : turnTimer <= 20 ? "#F39237" : "#fff" }}>{turnTimer}s</div>
                    <div style={{ marginTop: 4, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", maxWidth: 200, margin: "0 auto" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: turnTimer <= 10 ? "linear-gradient(90deg, #E8443A, #FF6B61)" : turnTimer <= 20 ? "linear-gradient(90deg, #F39237, #FFAB5E)" : `linear-gradient(90deg, ${myTheme.color}, ${myTheme.accent})`, width: `${(turnTimer / TURN_TIME) * 100}%`, transition: "width 1s linear" }} />
                    </div>
                    {turnTimer <= 5 && turnTimer > 0 && isMyTurn && (
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#E8443A", marginTop: 4 }}>Hurry! Auto-pick in {turnTimer}s</div>
                    )}
                  </div>
                )}
              </div>
            )}
            {lastCalledNumber && (
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#555", marginTop: 4 }}>
                Last called: <strong style={{ color: "#fff", fontSize: 16 }}>{lastCalledNumber}</strong>
              </div>
            )}
          </div>

          <MyGrid grid={displayGrid} marked={displayMarked} phase="play" onCellClick={handleCellClick}
            onRandomFill={() => {}} theme={myTheme} playerName={profile?.name || "You"}
            playerAvatar={profile?.avatar || "🎯"} isMyTurn={isMyTurn && !finishedPlayers[myId]}
            finishedPosition={getPosition(myId)} manualNext={0} />

          <div style={{ maxWidth: 600, margin: "20px auto 0" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#444", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center" }}>OPPONENTS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {playerList.map((rp, idx) => {
                if (rp.id === myId) return null;
                return (
                  <OpponentCard key={rp.id} name={rp.name} avatar={rp.avatar} theme={PLAYER_THEMES[idx]}
                    marked={toArray(roomData.gameData?.[rp.id]?.marked, TOTAL_CELLS, false)}
                    isCurrentTurn={currentTurnPlayerId === rp.id} phase="play"
                    finishedPosition={getPosition(rp.id)} />
                );
              })}
            </div>
          </div>

          {moveHistory.length > 0 && (
            <div style={{ maxWidth: 500, margin: "16px auto 0", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#333", marginBottom: 8, letterSpacing: "0.08em" }}>CALL HISTORY</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {moveHistory.slice(-30).map((m, i) => {
                  const pIdx = playerList.findIndex((p) => p.id === m.player);
                  const theme = PLAYER_THEMES[pIdx >= 0 ? pIdx : 0];
                  return (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 5, background: `${theme.color}12`, fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, color: theme.color }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: theme.color }} />{m.number}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Game Over ─── */}
      {phase === "gameover" && roomData && Object.keys(rankings).length > 0 && (
        <>
          <div style={{ textAlign: "center", marginBottom: 20, maxWidth: 420, margin: "0 auto 20px" }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>{getPosition(myId) === 0 ? "🎉" : "🏁"}</div>
            <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 28, fontWeight: 700, color: getPosition(myId) === 0 ? "#FFD700" : "#ccc", marginBottom: 4 }}>
              {getPosition(myId) === 0 ? "You Won!" : "Game Over!"}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#888" }}>
              You finished {POSITION_LABELS[getPosition(myId)] || "—"}
            </div>
          </div>

          <Leaderboard rankings={rankings} playerList={playerList} myId={myId} />

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 24 }}>
            {isHost && <button onClick={handleRematch} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #E8443A, #FF6B61)", color: "#fff", fontFamily: "'Fredoka', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Rematch</button>}
            <button onClick={handleLeave} style={{ padding: "12px 28px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#ccc", fontFamily: "'Fredoka', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Home</button>
          </div>

          <MyGrid grid={myGrid} marked={myMarked} phase="gameover" onCellClick={() => {}}
            onRandomFill={() => {}} theme={myTheme} playerName={profile?.name || "You"}
            playerAvatar={profile?.avatar || "🎯"} isMyTurn={false}
            finishedPosition={getPosition(myId)} manualNext={0} />

          <div style={{ maxWidth: 600, margin: "20px auto 0" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#444", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center" }}>ALL PLAYERS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {playerList.map((rp, idx) => {
                if (rp.id === myId) return null;
                return (
                  <OpponentCard key={rp.id} name={rp.name} avatar={rp.avatar} theme={PLAYER_THEMES[idx]}
                    marked={toArray(roomData.gameData?.[rp.id]?.marked, TOTAL_CELLS, false)}
                    isCurrentTurn={false} phase="gameover" finishedPosition={getPosition(rp.id)} />
                );
              })}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        button:active { transform: scale(0.96) !important; }
        input::placeholder { color: #444; }
      `}</style>
    </div>
  );
}
