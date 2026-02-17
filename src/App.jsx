import { useState, useEffect, useCallback, useRef } from "react";

const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const INIT_TIME = 45;
const LOBBY_COUNTDOWN = 60;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const BINGO_LETTERS = ["B", "I", "N", "G", "O"];

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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

const PHASES = {
  PROFILE: "profile", HOME: "home", LOBBY_CREATE: "lobby_create",
  LOBBY_WAIT: "lobby_wait", LOBBY_JOIN: "lobby_join",
  INIT: "init", PLAY: "play", GAMEOVER: "gameover", STATS: "stats",
};

const STORAGE_KEY = "bingo-profile";

const defaultProfile = () => ({
  id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  name: "", avatar: "🎯",
  gamesPlayed: 0, gamesWon: 0, winStreak: 0, bestStreak: 0, totalSequences: 0,
  createdAt: Date.now(),
});

function usePersistedProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) setProfile(JSON.parse(result.value));
      } catch {}
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

// ─── Shared Styles ───
const cardStyle = {
  background: "rgba(255,255,255,0.04)",
  borderRadius: 24, border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
};

const labelStyle = {
  fontFamily: "'DM Mono', monospace", fontSize: 11,
  color: "#555", fontWeight: 500, letterSpacing: "0.1em",
  display: "block", marginBottom: 8,
};

const btnPrimary = {
  width: "100%", padding: "14px", borderRadius: 14, border: "none",
  background: "linear-gradient(135deg, #E8443A, #FF6B61)",
  color: "#fff", fontFamily: "'Fredoka', sans-serif",
  fontSize: 17, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 4px 20px rgba(232,68,58,0.4)", transition: "transform 0.2s",
};

const btnSecondary = {
  width: "100%", padding: "12px", borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)",
  color: "#ccc", fontFamily: "'Fredoka', sans-serif",
  fontSize: 15, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
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
      <h2 style={{
        fontFamily: "'Fredoka', sans-serif", fontSize: 26,
        color: "#fff", margin: "0 0 8px", textAlign: "center",
      }}>{profile?.name ? "Edit Profile" : "Create Profile"}</h2>
      <p style={{
        fontFamily: "'DM Mono', monospace", fontSize: 12,
        color: "#555", textAlign: "center", margin: "0 0 28px",
      }}>Your stats persist between sessions</p>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>CHOOSE AVATAR</label>
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
        <label style={labelStyle}>DISPLAY NAME</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 20))}
          placeholder="Enter your name..." style={inputStyle}
          onFocus={(e) => e.target.style.borderColor = "#E8443A"}
          onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
        />
      </div>

      <button onClick={() => name.trim() && onSave({ ...defaultProfile(), ...profile, name: name.trim(), avatar })}
        disabled={!name.trim()}
        style={{ ...btnPrimary, opacity: name.trim() ? 1 : 0.4, cursor: name.trim() ? "pointer" : "default" }}>
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
      <button onClick={onBack} style={btnSecondary}>← Back</button>
    </div>
  );
}

// ─── Lobby Waiting Room ───
function LobbyWaitRoom({ room, myId, onStart, onLeave, countdown, isHost }) {
  const playerCount = room.players.length;
  const canStart = playerCount >= MIN_PLAYERS;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", ...cardStyle, padding: "32px 28px" }}>
      {/* Room Code Display */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: "#555", letterSpacing: "0.15em", marginBottom: 8,
        }}>ROOM CODE</div>
        <div style={{
          fontFamily: "'Fredoka', sans-serif", fontSize: 48, fontWeight: 700,
          letterSpacing: "0.15em", color: "#fff",
          background: "rgba(255,255,255,0.06)", borderRadius: 16,
          padding: "12px 24px", display: "inline-block",
          border: "2px dashed rgba(255,255,255,0.15)",
          userSelect: "all", cursor: "pointer",
        }}
          title="Click to copy"
          onClick={() => { try { navigator.clipboard.writeText(room.code); } catch {} }}
        >
          {room.code}
        </div>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: "#444", marginTop: 8,
        }}>Share this code with friends to join</div>
      </div>

      {/* Players List */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>PLAYERS ({playerCount}/{MAX_PLAYERS})</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {room.players.map((p, i) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 12,
              background: p.id === myId ? `${PLAYER_THEMES[i].color}15` : "rgba(255,255,255,0.03)",
              border: `1px solid ${p.id === myId ? `${PLAYER_THEMES[i].color}30` : "rgba(255,255,255,0.06)"}`,
              animation: "slideIn 0.3s ease-out",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(135deg, ${PLAYER_THEMES[i].color}, ${PLAYER_THEMES[i].accent})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, flexShrink: 0,
              }}>{p.avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 14,
                  color: "#eee", fontWeight: 600,
                }}>
                  {p.name}
                  {p.id === myId && <span style={{ color: "#666", fontSize: 10, marginLeft: 6 }}>(you)</span>}
                </div>
                {i === 0 && (
                  <span style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 9,
                    color: PLAYER_THEMES[0].color, letterSpacing: "0.05em",
                  }}>HOST</span>
                )}
              </div>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#4ade80", boxShadow: "0 0 8px rgba(74,222,128,0.5)",
              }} />
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: MAX_PLAYERS - playerCount }).map((_, i) => (
            <div key={`empty-${i}`} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 12,
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed rgba(255,255,255,0.08)",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, color: "#333",
              }}>?</div>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 13,
                color: "#333",
              }}>Waiting for player...</div>
            </div>
          ))}
        </div>
      </div>

      {/* Countdown / Status */}
      {canStart && countdown !== null && (
        <div style={{
          textAlign: "center", marginBottom: 20,
          padding: "14px 16px", borderRadius: 14,
          background: "rgba(74,222,128,0.08)",
          border: "1px solid rgba(74,222,128,0.2)",
        }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            color: "#4ade80", marginBottom: 4,
          }}>GAME STARTING IN</div>
          <div style={{
            fontFamily: "'Fredoka', sans-serif", fontSize: 36, fontWeight: 700,
            color: countdown <= 10 ? "#E8443A" : "#fff",
            transition: "color 0.3s",
          }}>{countdown}s</div>
          <div style={{
            marginTop: 8, height: 4, background: "rgba(255,255,255,0.06)",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: countdown <= 10
                ? "linear-gradient(90deg, #E8443A, #FF6B61)"
                : "linear-gradient(90deg, #4ade80, #22c55e)",
              width: `${(countdown / LOBBY_COUNTDOWN) * 100}%`,
              transition: "width 1s linear",
            }} />
          </div>
        </div>
      )}

      {!canStart && (
        <div style={{
          textAlign: "center", marginBottom: 20,
          padding: "14px 16px", borderRadius: 14,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#666",
          }}>
            ⏳ Need at least <strong style={{ color: "#ccc" }}>{MIN_PLAYERS} players</strong> to start
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        {isHost && canStart && (
          <button onClick={onStart} style={{ ...btnPrimary, flex: 2 }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.03)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          >Start Now 🚀</button>
        )}
        <button onClick={onLeave} style={{ ...btnSecondary, flex: 1 }}>Leave</button>
      </div>
    </div>
  );
}

// ─── Player's Own Grid (only their card visible) ───
function MyGrid({ player, phase, onCellClick, onRandomFill, theme, playerName, playerAvatar, isMyTurn }) {
  const { grid, marked, manualNext } = player;
  const { count: seqCount, completed } = checkSequences(marked);
  const completedCells = new Set(completed.flat());
  const bingoCount = Math.min(seqCount, 5);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 24,
      padding: "22px 20px 20px",
      border: `2.5px solid ${isMyTurn && phase === PHASES.PLAY ? theme.color : "rgba(255,255,255,0.08)"}`,
      boxShadow: isMyTurn && phase === PHASES.PLAY
        ? `0 0 30px ${theme.glow}, 0 12px 40px rgba(0,0,0,0.25)`
        : "0 8px 32px rgba(0,0,0,0.2)",
      transition: "all 0.4s cubic-bezier(.4,0,.2,1)",
      maxWidth: 400, width: "100%", margin: "0 auto",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `linear-gradient(135deg, ${theme.color}, ${theme.accent})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22,
          }}>{playerAvatar}</div>
          <div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color: "#eee",
            }}>{playerName}</div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555",
            }}>
              {phase === PHASES.PLAY ? `${seqCount}/5 sequences` : "Your card"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {BINGO_LETTERS.map((letter, i) => (
            <span key={letter} style={{
              fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontSize: 22,
              color: i < bingoCount ? theme.color : "#333",
              textShadow: i < bingoCount ? `0 0 12px ${theme.glow}` : "none",
              transition: "all 0.4s",
              transform: i < bingoCount ? "scale(1.2)" : "scale(1)",
              display: "inline-block",
            }}>{letter}</span>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
        gap: 5, maxWidth: 340, margin: "0 auto",
      }}>
        {Array.from({ length: TOTAL_CELLS }).map((_, idx) => {
          const val = grid[idx];
          const isMarked = marked[idx];
          const isCompleted = completedCells.has(idx);
          const canClickInit = phase === PHASES.INIT && val === null;
          const canClickPlay = phase === PHASES.PLAY && isMyTurn && val !== null && !isMarked;
          const clickable = canClickInit || canClickPlay;

          return (
            <button key={idx} onClick={() => clickable && onCellClick(idx)} style={{
              aspectRatio: "1", border: "none", borderRadius: 10,
              fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 17,
              cursor: clickable ? "pointer" : "default",
              transition: "all 0.2s cubic-bezier(.4,0,.2,1)",
              background: isCompleted
                ? `linear-gradient(135deg, ${theme.color}, ${theme.accent})`
                : isMarked ? `${theme.color}20` : val !== null ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
              color: isCompleted ? "#fff" : isMarked ? theme.color : val !== null ? "#ccc" : "#333",
              boxShadow: isCompleted ? `0 3px 12px ${theme.glow}` : isMarked ? `inset 0 0 0 2px ${theme.accent}40` : "inset 0 0 0 1px rgba(255,255,255,0.06)",
              outline: canClickInit ? `2px dashed ${theme.accent}50` : "none",
              outlineOffset: -2,
            }}
              onMouseEnter={(e) => { if (clickable) { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = `0 6px 20px ${theme.glow}`; } }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = isCompleted ? `0 3px 12px ${theme.glow}` : isMarked ? `inset 0 0 0 2px ${theme.accent}40` : "inset 0 0 0 1px rgba(255,255,255,0.06)"; }}
            >
              {val !== null ? val : phase === PHASES.INIT ? manualNext : ""}
            </button>
          );
        })}
      </div>

      {/* Init controls */}
      {phase === PHASES.INIT && (
        <div style={{ marginTop: 14, display: "flex", gap: 8, maxWidth: 340, margin: "14px auto 0" }}>
          <button onClick={onRandomFill} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, border: "none",
            background: `linear-gradient(135deg, ${theme.color}, ${theme.accent})`,
            color: "#fff", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, cursor: "pointer",
            transition: "transform 0.2s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.03)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          >🎲 Random Fill</button>
          <div style={{
            padding: "10px 14px", borderRadius: 12, background: `${theme.color}15`,
            color: theme.color, fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 12,
            display: "flex", alignItems: "center",
          }}>Next: {manualNext <= TOTAL_CELLS ? manualNext : "✓"}</div>
        </div>
      )}
    </div>
  );
}

// ─── Opponent Summary Card (hidden numbers) ───
function OpponentCard({ name, avatar, theme, marked, isCurrentTurn, phase, winner }) {
  const { count: seqCount } = checkSequences(marked);
  const bingoCount = Math.min(seqCount, 5);

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", borderRadius: 16,
      padding: "12px 14px",
      border: `2px solid ${isCurrentTurn && phase === PHASES.PLAY ? theme.color : "rgba(255,255,255,0.06)"}`,
      boxShadow: isCurrentTurn ? `0 0 16px ${theme.glow}` : "none",
      transition: "all 0.3s",
      flex: "1 1 160px", minWidth: 150, maxWidth: 220,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: `linear-gradient(135deg, ${theme.color}, ${theme.accent})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15,
        }}>{avatar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 12,
            color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {name}
            {winner && <span style={{
              fontSize: 9, color: "#fff", marginLeft: 6,
              background: "linear-gradient(135deg, #FFD700, #FFA500)",
              padding: "1px 5px", borderRadius: 4,
            }}>WIN</span>}
          </div>
        </div>
      </div>

      {/* Mini BINGO letters */}
      <div style={{ display: "flex", gap: 3, marginBottom: 8, justifyContent: "center" }}>
        {BINGO_LETTERS.map((letter, i) => (
          <span key={letter} style={{
            fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontSize: 14,
            color: i < bingoCount ? theme.color : "#333",
            textShadow: i < bingoCount ? `0 0 8px ${theme.glow}` : "none",
          }}>{letter}</span>
        ))}
      </div>

      {/* Mini grid showing only marked status, not numbers */}
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
        gap: 2,
      }}>
        {marked.map((isMarked, idx) => (
          <div key={idx} style={{
            aspectRatio: "1", borderRadius: 3,
            background: isMarked
              ? `linear-gradient(135deg, ${theme.color}, ${theme.accent})`
              : "rgba(255,255,255,0.04)",
            transition: "background 0.3s",
          }} />
        ))}
      </div>

      <div style={{
        textAlign: "center", marginTop: 6,
        fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#444",
      }}>{seqCount}/5 sequences</div>
    </div>
  );
}

// ─── Main Game ───
export default function BingoGame() {
  const { profile, updateProfile, loading } = usePersistedProfile();
  const [phase, setPhase] = useState(PHASES.HOME);
  const [room, setRoom] = useState(null); // { code, players: [{id, name, avatar}], hostId }
  const [myPlayerIndex, setMyPlayerIndex] = useState(0);
  const [players, setPlayers] = useState([]); // game state per player
  const [currentTurn, setCurrentTurn] = useState(0);
  const [initTimer, setInitTimer] = useState(INIT_TIME);
  const [lobbyCountdown, setLobbyCountdown] = useState(null);
  const [winnerId, setWinnerId] = useState(null);
  const [lastCalledNumber, setLastCalledNumber] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [simBotCount, setSimBotCount] = useState(1);
  const timerRef = useRef(null);
  const lobbyTimerRef = useRef(null);

  // Show profile editor if no profile
  useEffect(() => {
    if (!loading && !profile?.name && phase === PHASES.HOME) setPhase(PHASES.PROFILE);
  }, [loading, profile, phase]);

  // ─── Room Management ───
  const createRoom = () => {
    const code = generateRoomCode();
    const me = { id: profile.id, name: profile.name, avatar: profile.avatar };
    setRoom({ code, players: [me], hostId: profile.id });
    setMyPlayerIndex(0);
    setPhase(PHASES.LOBBY_WAIT);
    setLobbyCountdown(null);
  };

  const addBot = () => {
    if (!room || room.players.length >= MAX_PLAYERS) return;
    const botNames = ["Bot Alpha", "Bot Beta", "Bot Gamma"];
    const botAvatars = ["🤖", "🧠", "👾"];
    const botIdx = room.players.length - 1;
    const bot = {
      id: `bot_${Date.now()}`,
      name: botNames[botIdx] || `Bot ${botIdx + 1}`,
      avatar: botAvatars[botIdx] || "🤖",
      isBot: true,
    };
    setRoom((prev) => {
      const updated = { ...prev, players: [...prev.players, bot] };
      // Start countdown when 2nd player joins
      if (updated.players.length === MIN_PLAYERS && lobbyCountdown === null) {
        setLobbyCountdown(LOBBY_COUNTDOWN);
      }
      return updated;
    });
  };

  // Simulated join (for local play — in production this would be Firebase/WebSocket)
  const joinRoom = (code) => {
    // In local mode, we simulate joining by adding ourselves to the existing room
    // In production, this would query Firebase for the room
    if (!room || room.code !== code.toUpperCase()) {
      alert("Room not found. In this local version, one player creates a room and adds bots. For real online multiplayer, deploy with Firebase.");
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      alert("Room is full!");
      return;
    }
  };

  // Lobby countdown — auto-start after 60s once 2+ players
  useEffect(() => {
    if (phase !== PHASES.LOBBY_WAIT || lobbyCountdown === null) return;

    lobbyTimerRef.current = setInterval(() => {
      setLobbyCountdown((t) => {
        if (t <= 1) {
          clearInterval(lobbyTimerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(lobbyTimerRef.current);
  }, [phase, lobbyCountdown !== null]);

  // Auto-start when countdown hits 0
  useEffect(() => {
    if (lobbyCountdown === 0 && phase === PHASES.LOBBY_WAIT && room?.players.length >= MIN_PLAYERS) {
      startGameFromLobby();
    }
  }, [lobbyCountdown]);

  const startGameFromLobby = () => {
    if (!room || room.players.length < MIN_PLAYERS) return;
    clearInterval(lobbyTimerRef.current);
    const numP = room.players.length;
    setPlayers(Array.from({ length: numP }, () => ({
      grid: createEmptyGrid(), marked: Array(TOTAL_CELLS).fill(false),
      manualNext: 1, placed: new Set(), ready: false,
    })));
    setCurrentTurn(0);
    setInitTimer(INIT_TIME);
    setWinnerId(null);
    setLastCalledNumber(null);
    setMoveHistory([]);
    setPhase(PHASES.INIT);

    // Auto-fill bot grids immediately
    setTimeout(() => {
      setPlayers((prev) => {
        return prev.map((p, idx) => {
          if (room.players[idx]?.isBot) {
            const shuffled = Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1);
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return { ...p, grid: shuffled, manualNext: TOTAL_CELLS + 1, placed: new Set(shuffled), ready: true };
          }
          return p;
        });
      });
    }, 100);
  };

  // Init timer for player's own grid
  useEffect(() => {
    if (phase !== PHASES.INIT) return;
    timerRef.current = setInterval(() => {
      setInitTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // Auto-fill my grid
          autoFillPlayer(myPlayerIndex);
          setTimeout(() => setPhase(PHASES.PLAY), 500);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, myPlayerIndex]);

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
      p.ready = true;
      next[playerIdx] = p;
      return next;
    });
  }, []);

  const handleRandomFill = () => {
    autoFillPlayer(myPlayerIndex);
    clearInterval(timerRef.current);
    setTimeout(() => setPhase(PHASES.PLAY), 500);
  };

  const handleInitCellClick = (cellIdx) => {
    setPlayers((prev) => {
      const next = [...prev];
      const p = { ...next[myPlayerIndex] };
      if (p.grid[cellIdx] !== null) return prev;
      const newGrid = [...p.grid];
      newGrid[cellIdx] = p.manualNext;
      const newPlaced = new Set(p.placed);
      newPlaced.add(p.manualNext);
      p.grid = newGrid;
      p.manualNext = p.manualNext + 1;
      p.placed = newPlaced;
      next[myPlayerIndex] = p;

      if (p.manualNext > TOTAL_CELLS) {
        p.ready = true;
        clearInterval(timerRef.current);
        setTimeout(() => setPhase(PHASES.PLAY), 500);
      }
      return next;
    });
  };

  // Bot turn logic
  const executeBotTurn = useCallback((botIdx) => {
    setTimeout(() => {
      setPlayers((prev) => {
        const bot = prev[botIdx];
        // Find unmarked cells
        const unmarked = [];
        for (let i = 0; i < TOTAL_CELLS; i++) {
          if (!bot.marked[i] && bot.grid[i] !== null) unmarked.push(i);
        }
        if (unmarked.length === 0) return prev;
        const chosen = unmarked[Math.floor(Math.random() * unmarked.length)];
        const number = bot.grid[chosen];

        setLastCalledNumber(number);
        setMoveHistory((h) => [...h, { player: botIdx, number }]);

        // Mark on all grids
        const next = prev.map((p) => {
          const newMarked = [...p.marked];
          for (let i = 0; i < TOTAL_CELLS; i++) if (p.grid[i] === number) newMarked[i] = true;
          return { ...p, marked: newMarked };
        });

        // Check for winner
        setTimeout(() => {
          for (let i = 0; i < next.length; i++) {
            const { count } = checkSequences(next[i].marked);
            if (count >= 5) {
              setWinnerId(i);
              setPhase(PHASES.GAMEOVER);
              const mySeq = checkSequences(next[myPlayerIndex].marked).count;
              updateProfile((pr) => ({
                ...pr,
                gamesPlayed: pr.gamesPlayed + 1,
                gamesWon: i === myPlayerIndex ? pr.gamesWon + 1 : pr.gamesWon,
                winStreak: i === myPlayerIndex ? pr.winStreak + 1 : 0,
                bestStreak: i === myPlayerIndex ? Math.max(pr.bestStreak, pr.winStreak + 1) : pr.bestStreak,
                totalSequences: pr.totalSequences + mySeq,
              }));
              return;
            }
          }
          setCurrentTurn((t) => (t + 1) % room.players.length);
        }, 150);

        return next;
      });
    }, 800 + Math.random() * 1200); // Simulate thinking time
  }, [room, myPlayerIndex, updateProfile]);

  // Trigger bot turns
  useEffect(() => {
    if (phase !== PHASES.PLAY || winnerId !== null || !room) return;
    if (room.players[currentTurn]?.isBot) {
      executeBotTurn(currentTurn);
    }
  }, [currentTurn, phase, winnerId, room, executeBotTurn]);

  const handlePlayCellClick = (cellIdx) => {
    if (currentTurn !== myPlayerIndex || phase !== PHASES.PLAY || winnerId !== null) return;
    const myPlayer = players[myPlayerIndex];
    const number = myPlayer.grid[cellIdx];
    if (number === null || myPlayer.marked[cellIdx]) return;

    setLastCalledNumber(number);
    setMoveHistory((h) => [...h, { player: myPlayerIndex, number }]);

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
            const mySeq = checkSequences(next[myPlayerIndex].marked).count;
            updateProfile((pr) => ({
              ...pr,
              gamesPlayed: pr.gamesPlayed + 1,
              gamesWon: i === myPlayerIndex ? pr.gamesWon + 1 : pr.gamesWon,
              winStreak: i === myPlayerIndex ? pr.winStreak + 1 : 0,
              bestStreak: i === myPlayerIndex ? Math.max(pr.bestStreak, pr.winStreak + 1) : pr.bestStreak,
              totalSequences: pr.totalSequences + mySeq,
            }));
            return;
          }
        }
        setCurrentTurn((t) => (t + 1) % room.players.length);
      }, 150);

      return next;
    });
  };

  const handleCellClick = (cellIdx) => {
    if (phase === PHASES.INIT) handleInitCellClick(cellIdx);
    else if (phase === PHASES.PLAY) handlePlayCellClick(cellIdx);
  };

  const goHome = () => {
    setPhase(PHASES.HOME);
    setRoom(null);
    setPlayers([]);
    setWinnerId(null);
    setLobbyCountdown(null);
    setMoveHistory([]);
    clearInterval(timerRef.current);
    clearInterval(lobbyTimerRef.current);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(160deg, #0d0d1a 0%, #1a1a2e 50%, #0d0d1a 100%)",
      }}>
        <div style={{
          fontFamily: "'Fredoka', sans-serif", fontSize: 36,
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
        <h1 onClick={goHome} style={{
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

      {/* ─── Profile ─── */}
      {phase === PHASES.PROFILE && (
        <ProfileEditor profile={profile} onSave={(p) => { updateProfile(p); setPhase(PHASES.HOME); }} />
      )}

      {/* ─── Stats ─── */}
      {phase === PHASES.STATS && <StatsPanel profile={profile} onBack={() => setPhase(PHASES.HOME)} />}

      {/* ─── Home ─── */}
      {phase === PHASES.HOME && (
        <div style={{ maxWidth: 420, margin: "40px auto", ...cardStyle, padding: "40px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎯</div>
            <h2 style={{
              fontFamily: "'Fredoka', sans-serif", fontSize: 26, color: "#fff", margin: "0 0 6px",
            }}>Ready to play?</h2>
            <p style={{
              fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#555",
            }}>Create a room or join an existing one</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={createRoom} style={btnPrimary}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.03)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >Create Room 🏠</button>

            <div style={{
              display: "flex", alignItems: "center", gap: 12, margin: "4px 0",
            }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#444" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 5))}
                placeholder="ROOM CODE"
                style={{ ...inputStyle, flex: 1, textAlign: "center", letterSpacing: "0.2em", fontSize: 18 }}
              />
              <button onClick={() => joinRoom(joinCode)} disabled={joinCode.length < 5}
                style={{
                  ...btnSecondary, width: "auto", padding: "12px 20px",
                  opacity: joinCode.length >= 5 ? 1 : 0.4,
                }}>Join</button>
            </div>
          </div>

          <div style={{
            marginTop: 24, padding: "12px 14px", borderRadius: 12,
            background: "rgba(45,125,210,0.06)", border: "1px solid rgba(45,125,210,0.12)",
          }}>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#5BA4E8",
            }}>💡 This is local multiplayer with bots. Deploy with Firebase for real online rooms.</div>
          </div>
        </div>
      )}

      {/* ─── Lobby Wait ─── */}
      {phase === PHASES.LOBBY_WAIT && room && (
        <>
          <LobbyWaitRoom
            room={room} myId={profile.id}
            onStart={startGameFromLobby}
            onLeave={goHome}
            countdown={lobbyCountdown}
            isHost={room.hostId === profile.id}
          />
          {room.players.length < MAX_PLAYERS && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={addBot} style={{
                ...btnSecondary, width: "auto", display: "inline-flex",
                alignItems: "center", gap: 8, padding: "10px 24px",
              }}>
                🤖 Add Bot Player
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── Init Phase ─── */}
      {phase === PHASES.INIT && room && players[myPlayerIndex] && (
        <>
          <div style={{
            textAlign: "center", marginBottom: 18,
            background: "rgba(255,255,255,0.05)", borderRadius: 16,
            padding: "14px 20px", maxWidth: 420, margin: "0 auto 18px",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontFamily: "'Fredoka', sans-serif", fontSize: 16, color: "#fff" }}>
              Set up your card!
            </div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 36, fontWeight: 700,
              color: initTimer <= 10 ? "#E8443A" : "#fff", margin: "4px 0",
            }}>{initTimer}s</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#555" }}>
              Click cells to place numbers or use Random Fill
            </div>
            <div style={{
              marginTop: 10, height: 4, background: "rgba(255,255,255,0.06)",
              borderRadius: 2, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: initTimer <= 10
                  ? "linear-gradient(90deg, #E8443A, #FF6B61)"
                  : `linear-gradient(90deg, ${PLAYER_THEMES[myPlayerIndex].color}, ${PLAYER_THEMES[myPlayerIndex].accent})`,
                width: `${(initTimer / INIT_TIME) * 100}%`,
                transition: "width 1s linear",
              }} />
            </div>
          </div>

          <MyGrid
            player={players[myPlayerIndex]}
            phase={phase}
            onCellClick={handleCellClick}
            onRandomFill={handleRandomFill}
            theme={PLAYER_THEMES[myPlayerIndex]}
            playerName={room.players[myPlayerIndex].name}
            playerAvatar={room.players[myPlayerIndex].avatar}
            isMyTurn={true}
          />
        </>
      )}

      {/* ─── Play Phase ─── */}
      {phase === PHASES.PLAY && room && players[myPlayerIndex] && (
        <>
          {/* Turn banner */}
          <div style={{
            textAlign: "center", marginBottom: 16,
            background: "rgba(255,255,255,0.05)", borderRadius: 16,
            padding: "12px 20px", maxWidth: 420, margin: "0 auto 16px",
            border: `1px solid ${currentTurn === myPlayerIndex ? `${PLAYER_THEMES[myPlayerIndex].color}40` : "rgba(255,255,255,0.08)"}`,
          }}>
            <div style={{
              fontFamily: "'Fredoka', sans-serif", fontSize: 16, fontWeight: 700,
              color: currentTurn === myPlayerIndex ? PLAYER_THEMES[myPlayerIndex].color : "#888",
            }}>
              {currentTurn === myPlayerIndex
                ? "🎯 Your Turn — Pick a number!"
                : `⏳ ${room.players[currentTurn]?.name}'s turn...`
              }
            </div>
            {lastCalledNumber && (
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#555", marginTop: 4,
              }}>
                Last called: <strong style={{
                  color: PLAYER_THEMES[moveHistory[moveHistory.length - 1]?.player || 0].color,
                  fontSize: 16,
                }}>{lastCalledNumber}</strong>
              </div>
            )}
          </div>

          {/* My card */}
          <MyGrid
            player={players[myPlayerIndex]}
            phase={phase}
            onCellClick={handleCellClick}
            onRandomFill={() => {}}
            theme={PLAYER_THEMES[myPlayerIndex]}
            playerName={room.players[myPlayerIndex].name}
            playerAvatar={room.players[myPlayerIndex].avatar}
            isMyTurn={currentTurn === myPlayerIndex}
          />

          {/* Opponents */}
          <div style={{
            maxWidth: 600, margin: "20px auto 0",
          }}>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              color: "#444", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center",
            }}>OPPONENTS</div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center",
            }}>
              {room.players.map((rp, idx) => {
                if (idx === myPlayerIndex) return null;
                return (
                  <OpponentCard key={rp.id}
                    name={rp.name} avatar={rp.avatar}
                    theme={PLAYER_THEMES[idx]}
                    marked={players[idx]?.marked || Array(TOTAL_CELLS).fill(false)}
                    isCurrentTurn={currentTurn === idx}
                    phase={phase}
                    winner={false}
                  />
                );
              })}
            </div>
          </div>

          {/* Call history */}
          {moveHistory.length > 0 && (
            <div style={{
              maxWidth: 500, margin: "16px auto 0", padding: "12px 16px",
              background: "rgba(255,255,255,0.03)", borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 10,
                color: "#333", marginBottom: 8, letterSpacing: "0.08em",
              }}>CALL HISTORY</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {moveHistory.map((m, i) => (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "2px 6px", borderRadius: 5,
                    background: `${PLAYER_THEMES[m.player].color}12`,
                    fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700,
                    color: PLAYER_THEMES[m.player].color,
                  }}>
                    <span style={{
                      width: 4, height: 4, borderRadius: "50%",
                      background: PLAYER_THEMES[m.player].color,
                    }} />
                    {m.number}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Game Over ─── */}
      {phase === PHASES.GAMEOVER && room && winnerId !== null && (
        <>
          <div style={{
            textAlign: "center", marginBottom: 20,
            background: winnerId === myPlayerIndex
              ? "linear-gradient(135deg, rgba(255,215,0,0.12), rgba(255,165,0,0.08))"
              : "rgba(255,255,255,0.04)",
            borderRadius: 20, padding: "28px 24px",
            maxWidth: 420, margin: "0 auto 20px",
            border: winnerId === myPlayerIndex
              ? "1px solid rgba(255,215,0,0.25)"
              : "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>
              {winnerId === myPlayerIndex ? "🎉" : "😔"}
            </div>
            <div style={{
              fontFamily: "'Fredoka', sans-serif", fontSize: 28, fontWeight: 700,
              color: winnerId === myPlayerIndex ? "#FFD700" : "#ccc",
              marginBottom: 4,
            }}>
              {winnerId === myPlayerIndex ? "You Win!" : `${room.players[winnerId]?.name} wins!`}
            </div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#555",
            }}>
              {winnerId === myPlayerIndex ? "Amazing game! 🏆" : "Better luck next time!"}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
              <button onClick={() => {
                setLobbyCountdown(null);
                startGameFromLobby();
              }} style={{
                padding: "12px 28px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg, #E8443A, #FF6B61)",
                color: "#fff", fontFamily: "'Fredoka', sans-serif",
                fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}>Rematch</button>
              <button onClick={goHome} style={{
                padding: "12px 28px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)",
                color: "#ccc", fontFamily: "'Fredoka', sans-serif",
                fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}>Home</button>
            </div>
          </div>

          {/* Final card view */}
          <MyGrid
            player={players[myPlayerIndex]}
            phase={phase}
            onCellClick={() => {}}
            onRandomFill={() => {}}
            theme={PLAYER_THEMES[myPlayerIndex]}
            playerName={room.players[myPlayerIndex].name}
            playerAvatar={room.players[myPlayerIndex].avatar}
            isMyTurn={false}
          />

          {/* Opponent results */}
          <div style={{ maxWidth: 600, margin: "20px auto 0" }}>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              color: "#444", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center",
            }}>FINAL RESULTS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {room.players.map((rp, idx) => {
                if (idx === myPlayerIndex) return null;
                return (
                  <OpponentCard key={rp.id}
                    name={rp.name} avatar={rp.avatar}
                    theme={PLAYER_THEMES[idx]}
                    marked={players[idx]?.marked || Array(TOTAL_CELLS).fill(false)}
                    isCurrentTurn={false}
                    phase={phase}
                    winner={winnerId === idx}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        button:active { transform: scale(0.96) !important; }
        input::placeholder { color: #444; }
      `}</style>
    </div>
  );
}
