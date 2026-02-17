import { useState, useEffect, useCallback, useRef } from "react";

const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const INIT_TIME = 45;
const BINGO_LETTERS = ["B", "I", "N", "G", "O"];

const shuffleArray = () => {
  const arr = Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const createEmptyGrid = () => Array(TOTAL_CELLS).fill(null);

const checkSequences = (marked) => {
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

const PLAYER_THEMES = [
  { color: "#E8443A", bg: "#FFF0EF", accent: "#FF6B61", glow: "rgba(232,68,58,0.3)" },
  { color: "#2D7DD2", bg: "#EEF5FF", accent: "#5BA4E8", glow: "rgba(45,125,210,0.3)" },
  { color: "#1B9C85", bg: "#EEFBF7", accent: "#3CC4A7", glow: "rgba(27,156,133,0.3)" },
  { color: "#F39237", bg: "#FFF7ED", accent: "#FFAB5E", glow: "rgba(243,146,55,0.3)" },
];

const AVATARS = ["🎯", "🎲", "🃏", "🏆", "⚡", "🔥", "🌟", "🎪", "🎭", "🎨", "🚀", "💎", "🦊", "🐺", "🦁", "🐲"];

const PHASES = { LOBBY: "lobby", PROFILE: "profile", SETUP: "setup", INIT: "init", PLAY: "play", GAMEOVER: "gameover", STATS: "stats" };

const STORAGE_KEY = "bingo-profile";

const defaultProfile = () => ({
  id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  avatar: "🎯",
  gamesPlayed: 0,
  gamesWon: 0,
  winStreak: 0,
  bestStreak: 0,
  totalSequences: 0,
  createdAt: Date.now(),
});

function usePersistedProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) {
          setProfile(JSON.parse(result.value));
        }
      } catch {
        // No profile yet
      }
      setLoading(false);
    })();
  }, []);

  const updateProfile = useCallback(async (updater) => {
    setProfile((prev) => {
      const next = typeof updater === "function" ? updater(prev || defaultProfile()) : updater;
      (async () => {
        try { await window.storage.set(STORAGE_KEY, JSON.stringify(next)); }
        catch (e) { console.error("Save failed:", e); }
      })();
      return next;
    });
  }, []);

  return { profile, updateProfile, loading };
}

function ProfileEditor({ profile, onSave }) {
  const [name, setName] = useState(profile?.name || "");
  const [avatar, setAvatar] = useState(profile?.avatar || "🎯");

  return (
    <div style={{
      maxWidth: 440, margin: "0 auto", background: "rgba(255,255,255,0.04)",
      borderRadius: 28, padding: "36px 32px",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
    }}>
      <h2 style={{
        fontFamily: "'Fredoka', sans-serif", fontSize: 26,
        color: "#fff", margin: "0 0 8px", textAlign: "center",
      }}>
        {profile?.name ? "Edit Profile" : "Create Profile"}
      </h2>
      <p style={{
        fontFamily: "'DM Mono', monospace", fontSize: 12,
        color: "#666", textAlign: "center", margin: "0 0 28px",
      }}>
        Your stats persist between sessions
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: "#666", fontWeight: 500, letterSpacing: "0.1em",
          display: "block", marginBottom: 10,
        }}>CHOOSE AVATAR</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {AVATARS.map((a) => (
            <button key={a} onClick={() => setAvatar(a)} style={{
              width: 44, height: 44, borderRadius: 12, border: "none",
              background: avatar === a ? "linear-gradient(135deg, #E8443A, #FF6B61)" : "rgba(255,255,255,0.06)",
              fontSize: 22, cursor: "pointer",
              boxShadow: avatar === a ? "0 4px 16px rgba(232,68,58,0.3)" : "none",
              transition: "all 0.2s",
            }}>{a}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <label style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: "#666", fontWeight: 500, letterSpacing: "0.1em",
          display: "block", marginBottom: 8,
        }}>DISPLAY NAME</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 20))}
          placeholder="Enter your name..."
          style={{
            width: "100%", padding: "12px 16px", borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
            fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#fff",
            outline: "none", boxSizing: "border-box",
          }}
          onFocus={(e) => e.target.style.borderColor = "#E8443A"}
          onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
        />
      </div>

      <button onClick={() => name.trim() && onSave({ ...defaultProfile(), ...profile, name: name.trim(), avatar })}
        disabled={!name.trim()}
        style={{
          width: "100%", padding: "14px", borderRadius: 14, border: "none",
          background: name.trim() ? "linear-gradient(135deg, #E8443A, #FF6B61)" : "rgba(255,255,255,0.06)",
          color: name.trim() ? "#fff" : "#555",
          fontFamily: "'Fredoka', sans-serif", fontSize: 17, fontWeight: 700,
          cursor: name.trim() ? "pointer" : "default",
        }}>
        {profile?.name ? "Save Changes" : "Let's Play!"}
      </button>
    </div>
  );
}

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
    <div style={{
      maxWidth: 440, margin: "0 auto", background: "rgba(255,255,255,0.04)",
      borderRadius: 28, padding: "36px 32px",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
    }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{profile.avatar}</div>
        <h2 style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 24, color: "#fff", margin: "0 0 4px" }}>{profile.name}</h2>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#555" }}>
          Playing since {new Date(profile.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px",
            textAlign: "center", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff" }}>{s.value}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#666" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <button onClick={onBack} style={{
        width: "100%", padding: "12px", borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
        color: "#999", fontFamily: "'Fredoka', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer",
      }}>← Back to Lobby</button>
    </div>
  );
}

function PlayerGrid({ player, isActive, phase, onCellClick, onRandomFill, theme, playerName, playerAvatar, isCurrentTurn, winner }) {
  const { grid, marked, manualNext } = player;
  const { count: seqCount, completed } = checkSequences(marked);
  const completedCells = new Set(completed.flat());
  const bingoCount = Math.min(seqCount, 5);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 20, padding: "18px 16px 16px",
      border: `2.5px solid ${isCurrentTurn && phase === PHASES.PLAY ? theme.color : "rgba(255,255,255,0.06)"}`,
      boxShadow: isCurrentTurn && phase === PHASES.PLAY
        ? `0 0 24px ${theme.glow}, 0 8px 32px rgba(0,0,0,0.2)`
        : "0 4px 20px rgba(0,0,0,0.15)",
      transition: "all 0.35s cubic-bezier(.4,0,.2,1)",
      minWidth: 240, maxWidth: 320, flex: "1 1 270px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 18 }}>{playerAvatar}</span>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13,
            color: "#eee", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{playerName}</span>
          {winner && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#fff",
              background: "linear-gradient(135deg, #FFD700, #FFA500)",
              padding: "2px 7px", borderRadius: 6, fontFamily: "'DM Mono', monospace",
            }}>WINNER</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {BINGO_LETTERS.map((letter, i) => (
            <span key={letter} style={{
              fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontSize: 16,
              color: i < bingoCount ? theme.color : "#444",
              textShadow: i < bingoCount ? `0 0 10px ${theme.glow}` : "none",
              transition: "all 0.4s",
              transform: i < bingoCount ? "scale(1.15)" : "scale(1)",
              display: "inline-block",
            }}>{letter}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: 3, aspectRatio: "1" }}>
        {Array.from({ length: TOTAL_CELLS }).map((_, idx) => {
          const val = grid[idx];
          const isMarked = marked[idx];
          const isCompleted = completedCells.has(idx);
          const canClickInit = phase === PHASES.INIT && isActive && val === null;
          const canClickPlay = phase === PHASES.PLAY && isCurrentTurn && val !== null && !isMarked;
          const clickable = canClickInit || canClickPlay;

          return (
            <button key={idx} onClick={() => clickable && onCellClick(idx)} style={{
              aspectRatio: "1", border: "none", borderRadius: 7,
              fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 14,
              cursor: clickable ? "pointer" : "default",
              transition: "all 0.2s cubic-bezier(.4,0,.2,1)",
              background: isCompleted
                ? `linear-gradient(135deg, ${theme.color}, ${theme.accent})`
                : isMarked ? `${theme.color}20` : val !== null ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
              color: isCompleted ? "#fff" : isMarked ? theme.color : val !== null ? "#ccc" : "#444",
              boxShadow: isCompleted ? `0 2px 8px ${theme.glow}` : isMarked ? `inset 0 0 0 2px ${theme.accent}40` : "inset 0 0 0 1px rgba(255,255,255,0.06)",
              outline: canClickInit ? `2px dashed ${theme.accent}60` : "none",
              outlineOffset: -2,
            }}
            onMouseEnter={(e) => { if (clickable) { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = `0 4px 14px ${theme.glow}`; }}}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = isCompleted ? `0 2px 8px ${theme.glow}` : isMarked ? `inset 0 0 0 2px ${theme.accent}40` : "inset 0 0 0 1px rgba(255,255,255,0.06)"; }}
            >
              {val !== null ? val : phase === PHASES.INIT && isActive ? manualNext : ""}
            </button>
          );
        })}
      </div>

      {phase === PHASES.INIT && isActive && (
        <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
          <button onClick={onRandomFill} style={{
            flex: 1, padding: "7px 0", borderRadius: 10, border: "none",
            background: `linear-gradient(135deg, ${theme.color}, ${theme.accent})`,
            color: "#fff", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, cursor: "pointer",
          }}>🎲 Random Fill</button>
          <div style={{
            padding: "7px 10px", borderRadius: 10, background: `${theme.color}15`,
            color: theme.color, fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 10,
            display: "flex", alignItems: "center",
          }}>Next: {manualNext}</div>
        </div>
      )}

      {phase === PHASES.PLAY && (
        <div style={{
          marginTop: 8, textAlign: "center",
          fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555", fontWeight: 600,
        }}>{seqCount} / 5 sequences</div>
      )}
    </div>
  );
}

export default function BingoGame() {
  const { profile, updateProfile, loading } = usePersistedProfile();
  const [phase, setPhase] = useState(PHASES.LOBBY);
  const [numPlayers, setNumPlayers] = useState(2);
  const [playerNames, setPlayerNames] = useState(["", "Guest 2", "Guest 3", "Guest 4"]);
  const [playerAvatars, setPlayerAvatars] = useState(["🎯", "🎲", "🃏", "🏆"]);
  const [players, setPlayers] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [initTimer, setInitTimer] = useState(INIT_TIME);
  const [currentInitPlayer, setCurrentInitPlayer] = useState(0);
  const [winnerId, setWinnerId] = useState(null);
  const [lastCalledNumber, setLastCalledNumber] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (profile?.name) {
      setPlayerNames((prev) => { const n = [...prev]; n[0] = profile.name; return n; });
      setPlayerAvatars((prev) => { const a = [...prev]; a[0] = profile.avatar || "🎯"; return a; });
    }
  }, [profile]);

  useEffect(() => {
    if (!loading && !profile?.name && phase === PHASES.LOBBY) setPhase(PHASES.PROFILE);
  }, [loading, profile, phase]);

  const initializePlayers = (count) =>
    Array.from({ length: count }, () => ({
      grid: createEmptyGrid(), marked: Array(TOTAL_CELLS).fill(false), manualNext: 1, placed: new Set(),
    }));

  const startGame = () => {
    setPlayers(initializePlayers(numPlayers));
    setCurrentInitPlayer(0);
    setPhase(PHASES.INIT);
    setInitTimer(INIT_TIME);
    setCurrentTurn(0);
    setWinnerId(null);
    setLastCalledNumber(null);
    setMoveHistory([]);
  };

  const autoFillPlayer = useCallback((playerIdx) => {
    setPlayers((prev) => {
      const next = [...prev];
      const p = { ...next[playerIdx] };
      const newGrid = [...p.grid];
      const placed = new Set(p.placed);
      const remaining = [];
      for (let n = 1; n <= TOTAL_CELLS; n++) if (!placed.has(n)) remaining.push(n);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      let ri = 0;
      for (let i = 0; i < TOTAL_CELLS; i++) if (newGrid[i] === null) newGrid[i] = remaining[ri++];
      p.grid = newGrid;
      p.manualNext = TOTAL_CELLS + 1;
      p.placed = new Set(Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1));
      next[playerIdx] = p;
      return next;
    });
  }, []);

  useEffect(() => {
    if (phase !== PHASES.INIT) return;
    timerRef.current = setInterval(() => {
      setInitTimer((t) => {
        if (t <= 1) {
          autoFillPlayer(currentInitPlayer);
          if (currentInitPlayer < numPlayers - 1) {
            setCurrentInitPlayer((p) => p + 1);
            return INIT_TIME;
          } else {
            clearInterval(timerRef.current);
            setPhase(PHASES.PLAY);
            return 0;
          }
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, currentInitPlayer, numPlayers, autoFillPlayer]);

  const handleRandomFill = (playerIdx) => {
    if (playerIdx !== currentInitPlayer) return;
    autoFillPlayer(playerIdx);
    if (currentInitPlayer < numPlayers - 1) {
      setCurrentInitPlayer((p) => p + 1);
      setInitTimer(INIT_TIME);
    } else {
      clearInterval(timerRef.current);
      setPhase(PHASES.PLAY);
    }
  };

  const handleInitCellClick = (playerIdx, cellIdx) => {
    if (playerIdx !== currentInitPlayer) return;
    setPlayers((prev) => {
      const next = [...prev];
      const p = { ...next[playerIdx] };
      if (p.grid[cellIdx] !== null) return prev;
      const newGrid = [...p.grid];
      newGrid[cellIdx] = p.manualNext;
      const newPlaced = new Set(p.placed);
      newPlaced.add(p.manualNext);
      p.grid = newGrid;
      p.manualNext = p.manualNext + 1;
      p.placed = newPlaced;
      next[playerIdx] = p;
      if (p.manualNext > TOTAL_CELLS) {
        setTimeout(() => {
          if (currentInitPlayer < numPlayers - 1) {
            setCurrentInitPlayer((cp) => cp + 1);
            setInitTimer(INIT_TIME);
          } else {
            clearInterval(timerRef.current);
            setPhase(PHASES.PLAY);
          }
        }, 200);
      }
      return next;
    });
  };

  const handlePlayCellClick = (playerIdx, cellIdx) => {
    if (playerIdx !== currentTurn || phase !== PHASES.PLAY || winnerId !== null) return;
    const number = players[playerIdx].grid[cellIdx];
    if (number === null || players[playerIdx].marked[cellIdx]) return;

    setLastCalledNumber(number);
    setMoveHistory((h) => [...h, { player: playerIdx, number }]);

    setPlayers((prev) => {
      const next = prev.map((p) => {
        const newMarked = [...p.marked];
        for (let i = 0; i < TOTAL_CELLS; i++) if (p.grid[i] === number) newMarked[i] = true;
        return { ...p, marked: newMarked };
      });

      setTimeout(() => {
        for (let i = 0; i < next.length; i++) {
          const { count } = checkSequences(next[i].marked);
          if (count >= 5) {
            setWinnerId(i);
            setPhase(PHASES.GAMEOVER);
            const totalSeq = checkSequences(next[0].marked).count;
            updateProfile((p) => ({
              ...p,
              gamesPlayed: p.gamesPlayed + 1,
              gamesWon: i === 0 ? p.gamesWon + 1 : p.gamesWon,
              winStreak: i === 0 ? p.winStreak + 1 : 0,
              bestStreak: i === 0 ? Math.max(p.bestStreak, p.winStreak + 1) : p.bestStreak,
              totalSequences: p.totalSequences + totalSeq,
            }));
            return;
          }
        }
        setCurrentTurn((t) => (t + 1) % numPlayers);
      }, 100);
      return next;
    });
  };

  const handleCellClick = (playerIdx, cellIdx) => {
    if (phase === PHASES.INIT) handleInitCellClick(playerIdx, cellIdx);
    else if (phase === PHASES.PLAY) handlePlayCellClick(playerIdx, cellIdx);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(160deg, #0d0d1a 0%, #1a1a2e 50%, #0d0d1a 100%)",
      }}>
        <div style={{
          fontFamily: "'Fredoka', sans-serif", fontSize: 32,
          background: "linear-gradient(135deg, #E8443A, #2D7DD2, #1B9C85, #F39237)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          animation: "pulse 1.5s infinite",
        }}>BINGO</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0d0d1a 0%, #1a1a2e 50%, #12122a 100%)",
      fontFamily: "'Inter', sans-serif", padding: "20px 12px", color: "#fff",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 900, margin: "0 auto 20px", padding: "0 4px",
      }}>
        <h1 onClick={() => phase !== PHASES.INIT && phase !== PHASES.PLAY && setPhase(PHASES.LOBBY)} style={{
          fontFamily: "'Fredoka', sans-serif", fontSize: 32, fontWeight: 700,
          background: "linear-gradient(135deg, #E8443A, #FF6B61, #F39237)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          margin: 0, letterSpacing: "0.06em", cursor: "pointer",
        }}>BINGO</h1>
        {profile?.name && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setPhase(PHASES.STATS)} style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "6px 12px", cursor: "pointer",
              fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#ccc",
              display: "flex", alignItems: "center", gap: 6,
            }}>📊 Stats</button>
            <button onClick={() => setPhase(PHASES.PROFILE)} style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "6px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#ccc",
            }}>
              <span style={{ fontSize: 16 }}>{profile.avatar}</span> {profile.name}
            </button>
          </div>
        )}
      </div>

      {phase === PHASES.PROFILE && (
        <ProfileEditor profile={profile} onSave={(p) => { updateProfile(p); setPhase(PHASES.LOBBY); }} />
      )}

      {phase === PHASES.STATS && (
        <StatsPanel profile={profile} onBack={() => setPhase(PHASES.LOBBY)} />
      )}

      {/* Lobby */}
      {phase === PHASES.LOBBY && (
        <div style={{
          maxWidth: 480, margin: "40px auto", background: "rgba(255,255,255,0.04)",
          borderRadius: 28, padding: "36px 28px",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
        }}>
          <h2 style={{
            fontFamily: "'Fredoka', sans-serif", fontSize: 22,
            color: "#fff", margin: "0 0 6px", textAlign: "center",
          }}>New Game</h2>
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            color: "#555", textAlign: "center", margin: "0 0 28px",
          }}>Local multiplayer — pass the device between turns</p>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: "#555", letterSpacing: "0.1em", display: "block", marginBottom: 10,
            }}>NUMBER OF PLAYERS</label>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {[2, 3, 4].map((n) => (
                <button key={n} onClick={() => setNumPlayers(n)} style={{
                  width: 52, height: 52, borderRadius: 14, border: "none",
                  background: numPlayers === n ? "linear-gradient(135deg, #E8443A, #FF6B61)" : "rgba(255,255,255,0.06)",
                  color: numPlayers === n ? "#fff" : "#888",
                  fontFamily: "'Fredoka', sans-serif", fontSize: 22, fontWeight: 700, cursor: "pointer",
                  boxShadow: numPlayers === n ? "0 4px 16px rgba(232,68,58,0.3)" : "none",
                  transition: "all 0.2s",
                }}>{n}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: "#555", letterSpacing: "0.1em", display: "block", marginBottom: 10,
            }}>PLAYER NAMES</label>
            {Array.from({ length: numPlayers }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: PLAYER_THEMES[i].color, display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0,
                }}>{playerAvatars[i]}</div>
                <input type="text" value={playerNames[i]}
                  onChange={(e) => { const names = [...playerNames]; names[i] = e.target.value.slice(0, 20); setPlayerNames(names); }}
                  disabled={i === 0} placeholder={`Player ${i + 1}`}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: i === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
                    fontFamily: "'DM Mono', monospace", fontSize: 13,
                    color: i === 0 ? "#666" : "#fff", outline: "none",
                  }}
                />
                {i === 0 && (
                  <span style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#444",
                    padding: "3px 6px", background: "rgba(255,255,255,0.04)", borderRadius: 6,
                  }}>YOU</span>
                )}
              </div>
            ))}
          </div>

          <button onClick={startGame} style={{
            width: "100%", padding: "14px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg, #E8443A, #FF6B61)",
            color: "#fff", fontFamily: "'Fredoka', sans-serif", fontSize: 18, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 20px rgba(232,68,58,0.4)", transition: "transform 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.03)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          >Start Game 🎯</button>

          {/* Deployment Guide */}
          <div style={{
            marginTop: 24, padding: "18px 16px",
            background: "rgba(255,255,255,0.02)", borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.05)",
          }}>
            <h3 style={{
              fontFamily: "'Fredoka', sans-serif", fontSize: 14, color: "#888", margin: "0 0 12px",
            }}>🚀 Deploy & Go Online</h3>
            {[
              { t: "Web", c: "#1B9C85", d: "Deploy to Vercel/Netlify. Add Firebase for Google auth + Firestore for real-time multiplayer." },
              { t: "Mobile", c: "#2D7DD2", d: "Wrap with Capacitor.js → Android ($25) & iOS ($99/yr). Or rebuild in React Native + Expo." },
              { t: "Online Rooms", c: "#F39237", d: "Firebase Realtime DB or Supabase Realtime for game sync. Players join rooms with codes." },
              { t: "Google Sign-In", c: "#E8443A", d: "Firebase Auth + Google provider. ~30 min setup. Store profiles & stats in Firestore." },
            ].map((item) => (
              <div key={item.t} style={{
                marginBottom: 8, padding: "10px 12px",
                background: `${item.c}08`, borderRadius: 10, borderLeft: `3px solid ${item.c}`,
              }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: item.c, fontWeight: 500 }}>
                  {item.t}
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#666", marginLeft: 8 }}>
                  {item.d}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Init Phase Banner */}
      {phase === PHASES.INIT && (
        <div style={{
          textAlign: "center", marginBottom: 18,
          background: "rgba(255,255,255,0.05)", borderRadius: 16,
          padding: "14px 20px", maxWidth: 500, margin: "0 auto 18px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 15, color: "#fff" }}>
            <span style={{ color: PLAYER_THEMES[currentInitPlayer].color }}>
              {playerNames[currentInitPlayer] || `Player ${currentInitPlayer + 1}`}
            </span> — Fill your grid!
          </div>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 32, fontWeight: 700,
            color: initTimer <= 10 ? "#E8443A" : "#fff", margin: "4px 0",
          }}>{initTimer}s</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555" }}>
            Click cells sequentially or use Random Fill
          </div>
          <div style={{
            marginTop: 10, height: 4, background: "rgba(255,255,255,0.06)",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: initTimer <= 10
                ? "linear-gradient(90deg, #E8443A, #FF6B61)"
                : `linear-gradient(90deg, ${PLAYER_THEMES[currentInitPlayer].color}, ${PLAYER_THEMES[currentInitPlayer].accent})`,
              width: `${(initTimer / INIT_TIME) * 100}%`,
              transition: "width 1s linear",
            }} />
          </div>
        </div>
      )}

      {/* Play Phase Banner */}
      {phase === PHASES.PLAY && winnerId === null && (
        <div style={{
          textAlign: "center", marginBottom: 18,
          background: "rgba(255,255,255,0.05)", borderRadius: 16,
          padding: "12px 20px", maxWidth: 500, margin: "0 auto 18px",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: PLAYER_THEMES[currentTurn].color,
            boxShadow: `0 0 10px ${PLAYER_THEMES[currentTurn].glow}`,
            animation: "pulse 1.5s infinite",
          }} />
          <div>
            <span style={{
              fontFamily: "'Fredoka', sans-serif", fontSize: 15,
              color: PLAYER_THEMES[currentTurn].color, fontWeight: 700,
            }}>{playerNames[currentTurn] || `Player ${currentTurn + 1}`}'s turn</span>
            {lastCalledNumber && (
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11,
                color: "#555", marginLeft: 12,
              }}>Last: <strong style={{ color: "#ccc" }}>{lastCalledNumber}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* Game Over */}
      {phase === PHASES.GAMEOVER && winnerId !== null && (
        <div style={{
          textAlign: "center", marginBottom: 18,
          background: "linear-gradient(135deg, rgba(255,215,0,0.12), rgba(255,165,0,0.08))",
          borderRadius: 16, padding: "20px 24px",
          maxWidth: 500, margin: "0 auto 18px",
          border: "1px solid rgba(255,215,0,0.25)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>🎉</div>
          <div style={{
            fontFamily: "'Fredoka', sans-serif", fontSize: 24, color: "#FFD700", fontWeight: 700,
          }}>{playerNames[winnerId] || `Player ${winnerId + 1}`} wins!</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
            <button onClick={startGame} style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #E8443A, #FF6B61)",
              color: "#fff", fontFamily: "'Fredoka', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>Rematch</button>
            <button onClick={() => { setPhase(PHASES.LOBBY); setWinnerId(null); }} style={{
              padding: "10px 24px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)",
              color: "#ccc", fontFamily: "'Fredoka', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>Lobby</button>
          </div>
        </div>
      )}

      {/* Player Grids */}
      {(phase === PHASES.INIT || phase === PHASES.PLAY || phase === PHASES.GAMEOVER) && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 14,
          justifyContent: "center", maxWidth: 1400, margin: "0 auto",
        }}>
          {players.map((player, idx) => (
            <PlayerGrid key={idx} player={player}
              isActive={phase === PHASES.INIT && idx === currentInitPlayer}
              phase={phase} onCellClick={(cellIdx) => handleCellClick(idx, cellIdx)}
              onRandomFill={() => handleRandomFill(idx)} theme={PLAYER_THEMES[idx]}
              playerName={playerNames[idx] || `Player ${idx + 1}`}
              playerAvatar={playerAvatars[idx]}
              isCurrentTurn={currentTurn === idx} winner={winnerId === idx}
            />
          ))}
        </div>
      )}

      {/* Move History */}
      {moveHistory.length > 0 && (phase === PHASES.PLAY || phase === PHASES.GAMEOVER) && (
        <div style={{
          maxWidth: 500, margin: "16px auto 0", padding: "12px 16px",
          background: "rgba(255,255,255,0.04)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: "#444", marginBottom: 8, fontWeight: 500, letterSpacing: "0.08em",
          }}>CALL HISTORY</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {moveHistory.map((m, i) => (
              <span key={i} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 7px", borderRadius: 6,
                background: `${PLAYER_THEMES[m.player].color}15`,
                fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700,
                color: PLAYER_THEMES[m.player].color,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: PLAYER_THEMES[m.player].color,
                }} />
                {m.number}
              </span>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        button:active { transform: scale(0.96) !important; }
        input::placeholder { color: #444; }
      `}</style>
    </div>
  );
}
