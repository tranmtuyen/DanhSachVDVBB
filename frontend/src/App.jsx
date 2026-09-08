import React, { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ======================================================================
   Địa chỉ backend Django. Đổi dòng này khi triển khai public
   (ví dụ: "https://diem.clbbongban-cuaban.vn").
   ====================================================================== */
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "http://localhost:8000";
const API = `${API_ORIGIN}/api`;

/* ---------- Design tokens (tham khảo phong cách bongbantv.com.vn) ---------- */
const C = {
  bg: "#F4F5FA",
  surface: "#FFFFFF",
  ink: "#10162B",
  muted: "#7A8194",
  line: "#E9EAF2",
  nameColor: "#242E63",
  accent: "#E2481F",
  gold: "#E3A13B",
  silver: "#9AA1B3",
  bronze: "#B77F4E",
  pillUpBg: "#E4F6EA", pillUpText: "#1E8E52",
  pillDownBg: "#FBE7E6", pillDownText: "#D6453B",
  pillScoreBg: "#EEE9FB", pillScoreText: "#6B3FC7",
  bad: "#D6453B",
};

const HANG_COLOR = { D: "#1E8E52", E: "#3E8B62", F: "#B8862B", G: "#C9772E", H: "#8A8A85" };
const FONT_DISPLAY = "'Be Vietnam Pro', sans-serif";
const FONT_BODY = "'Be Vietnam Pro', sans-serif";

const LOAI_GIAI_LABEL = { khong_chap: "Không chấp điểm", co_chap: "Có chấp điểm", giao_huu: "Giao hữu" };
const BONUS_LABEL = { vo_dich: "Vô địch", a_quan: "Á quân", hang_ba: "Hạng Ba", tu_ket: "Tứ kết" };

/* ---------- Elo dùng để XEM TRƯỚC ở form (server mới là nơi tính chính thức) ---------- */
const K_FACTOR = { khong_chap: 32, co_chap: 20, giao_huu: 10 };

function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}
function computeMatchDeltaPreview(rA, rB, winner, loaiGiai) {
  const K = K_FACTOR[loaiGiai] ?? 20;
  const eA = expectedScore(rA, rB);
  const sA = winner === "A" ? 1 : 0;
  const deltaA = Math.round(K * (sA - eA));
  return { deltaA, deltaB: -deltaA };
}

function fmtDate(d) {
  if (!d) return "";
  try {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  } catch {
    return d;
  }
}
const todayStr = () => new Date().toISOString().slice(0, 10);

/* Bỏ dấu tiếng Việt + chữ thường, dùng để tìm kiếm gần đúng không phân biệt dấu/hoa-thường */
function normalizeVN(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

const ROLES = [
  { id: "admin", label: "Quản trị viên" },
  { id: "manager", label: "Quản lý giải đấu" },
  { id: "scorer", label: "Người nhập liệu" },
  { id: "public", label: "Công khai (xem)" },
];

/* ---------- API helpers ---------- */
async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} thất bại (${res.status})`);
  return res.json();
}
async function apiPostJSON(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || JSON.stringify(err) || `POST ${path} thất bại`);
  }
  return res.json();
}
async function apiPatchJSON(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || JSON.stringify(err) || `PATCH ${path} thất bại`);
  }
  return res.json();
}
async function apiForm(path, method, formData) {
  const res = await fetch(`${API}${path}`, { method, body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || JSON.stringify(err) || `${method} ${path} thất bại`);
  }
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} thất bại (${res.status})`);
}

function photoUrl(p) {
  if (!p || !p.photo) return null;
  return p.photo.startsWith("http") ? p.photo : `${API_ORIGIN}${p.photo}`;
}

/* ---------- Small UI atoms ---------- */
function HangBadge({ hang }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: HANG_COLOR[hang] + "17", color: HANG_COLOR[hang], fontFamily: FONT_DISPLAY, letterSpacing: 0.2 }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: HANG_COLOR[hang] }} />
      Hạng {hang}
    </span>
  );
}
function TypeTag({ type }) {
  const color = type === "khong_chap" ? C.accent : type === "co_chap" ? "#1E8E52" : C.muted;
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color, background: color + "14" }}>
      {LOAI_GIAI_LABEL[type]}
    </span>
  );
}
function Avatar({ player, size = 32 }) {
  const url = photoUrl(player);
  const hang = player?.hang || "H";
  const initials = (player?.name || "?").trim().split(/\s+/).slice(-1)[0]?.[0]?.toUpperCase() || "?";
  if (url) {
    return (
      <img
        src={url}
        alt={player.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `1.5px solid ${HANG_COLOR[hang]}40` }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: HANG_COLOR[hang] + "1A", color: HANG_COLOR[hang],
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.4, fontWeight: 700, fontFamily: FONT_DISPLAY,
        border: `1.5px solid ${HANG_COLOR[hang]}40`,
      }}
    >
      {initials}
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span style={{ color: C.muted, fontSize: 12.5 }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle = {
  border: `1.5px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", fontSize: 14,
  fontFamily: FONT_BODY, color: C.ink, background: "#fff", outline: "none", transition: "border-color 120ms ease",
};
const btnPrimary = {
  background: C.accent, color: "#fff", border: "none", borderRadius: 999, padding: "10px 20px",
  fontSize: 14, fontWeight: 700, fontFamily: FONT_BODY, cursor: "pointer", boxShadow: `0 1px 2px ${C.accent}55`,
};
const btnGhost = {
  background: "transparent", color: C.ink, border: `1.5px solid ${C.line}`, borderRadius: 999,
  padding: "10px 20px", fontSize: 14, fontWeight: 700, fontFamily: FONT_BODY, cursor: "pointer",
};

function ScorePill({ value, style }) {
  return (
    <span className="tabular" style={{ background: C.pillScoreBg, color: C.pillScoreText, fontWeight: 700, fontSize: 13.5, padding: "4px 12px", borderRadius: 999, ...style }}>
      {value}
    </span>
  );
}
function DeltaPill({ info }) {
  if (!info) return <span style={{ color: C.muted, fontSize: 13 }}>—</span>;
  if (info.isDoubles) {
    return (
      <span style={{ background: C.line, color: C.muted, fontWeight: 700, fontSize: 12, padding: "4px 10px", borderRadius: 999 }}>
        Đôi · không tính điểm
      </span>
    );
  }
  const { delta } = info;
  const up = delta > 0, flat = delta === 0;
  const bg = flat ? C.line : up ? C.pillUpBg : C.pillDownBg;
  const text = flat ? C.muted : up ? C.pillUpText : C.pillDownText;
  return (
    <span className="tabular inline-flex items-center gap-1" style={{ background: bg, color: text, fontWeight: 700, fontSize: 12.5, padding: "4px 10px", borderRadius: 999 }}>
      {!flat && (up ? "↗" : "↘")} {up && !flat ? "+" : ""}{delta}
    </span>
  );
}
function SearchBox({ value, onChange, placeholder }) {
  return (
    <input
      type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || "Tìm theo tên…"} style={{ ...inputStyle, width: "100%", maxWidth: 320 }}
    />
  );
}
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3" style={{ padding: "12px 16px" }}>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}
        style={{ ...btnGhost, padding: "6px 14px", fontSize: 13, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "default" : "pointer" }}>
        ← Trước
      </button>
      <span style={{ fontSize: 13, color: C.muted }}>Trang {page} / {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}
        style={{ ...btnGhost, padding: "6px 14px", fontSize: 13, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "default" : "pointer" }}>
        Sau →
      </button>
    </div>
  );
}
function EmptyState({ text }) {
  return (
    <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 14, padding: "36px 20px", textAlign: "center", color: C.muted, fontSize: 14 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, margin: "0 auto 12px", opacity: 0.6 }} />
      {text}
    </div>
  );
}
function PaddleIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <circle cx="12" cy="12" r="9" fill={C.accent} />
      <circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.25" />
      <rect x="17" y="17" width="10" height="4" rx="2" transform="rotate(45 17 17)" fill="#fff" opacity="0.9" />
    </svg>
  );
}

function winLossOf(playerId, matches) {
  let win = 0, loss = 0;
  for (const m of matches) {
    const inA = m.player_a === playerId || m.player_a2 === playerId;
    const inB = m.player_b === playerId || m.player_b2 === playerId;
    if (!inA && !inB) continue;
    const side = inA ? "A" : "B";
    if (side === m.winner_side) win++; else loss++;
  }
  return { win, loss };
}
function lastDeltaOf(playerId, history) {
  const ph = history.filter((h) => h.player === playerId);
  if (ph.length === 0) return null;
  const last = ph[0]; // API trả về mới nhất trước (-created_at)
  return { delta: last.delta, isDoubles: !!last.is_doubles };
}

/* ================= APP ================= */
export default function App() {
  const [players, setPlayers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [role, setRole] = useState("admin");
  const [tab, setTab] = useState("leaderboard");
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  async function refreshAll() {
    try {
      const [p, t, m, r, h] = await Promise.all([
        apiGet("/players/"), apiGet("/tournaments/"), apiGet("/matches/"),
        apiGet("/results/"), apiGet("/history/"),
      ]);
      setPlayers(p); setTournaments(t); setMatches(m); setResults(r); setHistory(h);
      setLoadError("");
    } catch (e) {
      setLoadError(`Không kết nối được tới backend tại ${API_ORIGIN}. Hãy chắc chắn Django đang chạy.`);
    }
    setLoaded(true);
  }
  useEffect(() => { refreshAll(); }, []);

  async function addPlayer({ name, nickname, initRating, birthYear, idNumber, photoFile }) {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("nickname", nickname || "");
    fd.append("rating", String(initRating));
    if (birthYear) fd.append("birth_year", String(birthYear));
    if (idNumber) fd.append("id_number", idNumber);
    if (photoFile) fd.append("photo", photoFile);
    await apiForm("/players/", "POST", fd);
    await refreshAll();
  }

  async function editPlayer(playerId, { name, nickname, birthYear, idNumber, photoFile }) {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("nickname", nickname || "");
    fd.append("birth_year", birthYear ? String(birthYear) : "");
    fd.append("id_number", idNumber || "");
    if (photoFile) fd.append("photo", photoFile);
    await apiForm(`/players/${playerId}/`, "PATCH", fd);
    await refreshAll();
  }

  async function addTournament({ name, type, date }) {
    await apiPostJSON("/tournaments/", { name, type, date });
    await refreshAll();
  }
  async function closeTournament(tid) {
    await apiPatchJSON(`/tournaments/${tid}/`, { status: "da_ket_thuc" });
    await refreshAll();
  }

  async function addMatch({ tournamentId, mode, playerAId, playerBId, playerA2Id, playerB2Id, setsA, setsB, friendlyDate }) {
    await apiPostJSON("/matches/", {
      tournament: tournamentId || null,
      mode: mode || "don",
      player_a: playerAId, player_b: playerBId,
      player_a2: playerA2Id || null, player_b2: playerB2Id || null,
      sets_a: setsA, sets_b: setsB,
      ...(friendlyDate ? { date: friendlyDate } : {}),
    });
    await refreshAll();
  }

  async function editMatch(matchId, { playerAId, playerBId, playerA2Id, playerB2Id, setsA, setsB, date }) {
    await apiPatchJSON(`/matches/${matchId}/`, {
      player_a: playerAId, player_b: playerBId,
      player_a2: playerA2Id || null, player_b2: playerB2Id || null,
      sets_a: setsA, sets_b: setsB,
      ...(date ? { date } : {}),
    });
    await refreshAll();
  }

  async function deleteMatch(matchId) {
    await apiDelete(`/matches/${matchId}/`);
    await refreshAll();
  }

  async function addResult({ tournamentId, playerId, placement }) {
    await apiPostJSON("/results/", { tournament: tournamentId, player: playerId, placement });
    await refreshAll();
  }

  const canManagePlayers = role === "admin";
  const canManageTournaments = role === "admin" || role === "manager";
  const canEnterResults = role === "admin" || role === "manager";
  const canEnterMatches = role === "admin" || role === "manager" || role === "scorer";

  const visibleTabs = [
    { id: "leaderboard", label: "Bảng xếp hạng", show: true },
    { id: "players", label: "Vận động viên", show: true },
    { id: "tournaments", label: "Giải đấu", show: true },
    { id: "friendly", label: "Giao hữu", show: true },
    { id: "enter-match", label: "Nhập trận đấu", show: canEnterMatches },
  ].filter((t) => t.show);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.id === tab)) setTab("leaderboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const data = { players, tournaments, matches, results, history };

  if (!loaded) {
    return <div style={{ fontFamily: FONT_BODY, color: C.muted, padding: 40 }}>Đang tải dữ liệu…</div>;
  }

  return (
    <div style={{ background: C.bg, minHeight: "100%", fontFamily: FONT_BODY, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;0,800;1,600;1,700&display=swap');
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; }
        .tabular { font-variant-numeric: tabular-nums; font-family: ${FONT_DISPLAY}; }
        button { transition: transform 120ms ease, opacity 120ms ease; }
        button:hover { transform: translateY(-1px); }
        button:active { transform: translateY(0); }
        select, input { font-family: inherit; }
        input:focus, select:focus { border-color: ${C.accent} !important; }
        tr[data-row]:hover { background: ${C.bg}; }
      `}</style>

      {/* Header */}
      <div style={{ background: C.ink }}>
        <div className="max-w-5xl mx-auto" style={{ padding: "20px 24px", position: "relative" }}>
          <label className="flex flex-col gap-1 text-sm" style={{ position: "absolute", top: 20, left: 24 }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: -0.2, color: "#fff" }}>DANH SÁCH</span>
          </label>
          <label className="flex flex-col gap-1 text-sm" style={{ position: "absolute", top: 20, right: 24 }}>
            <span style={{ color: "#9BA89E", fontSize: 12.5 }}>Vai trò xem thử</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, minWidth: 190, background: "#1E2D22", color: "#fff", border: "1.5px solid #2C3E31" }}>
              {ROLES.map((r) => <option key={r.id} value={r.id} style={{ color: C.ink }}>{r.label}</option>)}
            </select>
          </label>
        </div>
        <div className="max-w-5xl mx-auto flex gap-1" style={{ padding: "0 24px" }}>
          {visibleTabs.map((t) => (
            <button
              key={t.id} onClick={() => setTab(t.id)}
              style={{
                background: "transparent", border: "none",
                borderBottom: tab === t.id ? `2.5px solid ${C.accent}` : "2.5px solid transparent",
                color: tab === t.id ? "#fff" : "#8B9A90", fontWeight: tab === t.id ? 700 : 500,
                fontSize: 14, padding: "10px 14px", cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto" style={{ padding: "24px" }}>
        {loadError && (
          <div style={{ background: "#FBEAE7", color: C.bad, border: `1px solid ${C.bad}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13.5 }}>
            {loadError}
          </div>
        )}
        {role === "public" && (
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
            Bạn đang xem ở chế độ công khai — chỉ xem, không thể nhập hay chỉnh sửa dữ liệu.
          </div>
        )}

        {tab === "leaderboard" && (
          <Leaderboard players={players} matches={matches} history={history} onSelect={(p) => { setSelectedPlayer(p); setTab("player-detail"); }} />
        )}

        {tab === "players" && (
          <PlayersTab players={players} canManage={canManagePlayers} onAdd={addPlayer} onSelect={(p) => { setSelectedPlayer(p); setTab("player-detail"); }} />
        )}

        {tab === "player-detail" && selectedPlayer && (
          <PlayerDetail
            player={players.find((p) => p.id === selectedPlayer.id) || selectedPlayer}
            history={history.filter((h) => h.player === selectedPlayer.id)}
            canManage={canManagePlayers}
            onEdit={editPlayer}
            onBack={() => setTab("players")}
          />
        )}

        {tab === "tournaments" && (
          <TournamentsTab
            data={data} canCreate={canManageTournaments} canEnterResults={canEnterResults} canEnterMatches={canEnterMatches}
            onAddTournament={addTournament} onCloseTournament={closeTournament} onAddResult={addResult}
            onEditMatch={editMatch} onDeleteMatch={deleteMatch}
          />
        )}

        {tab === "friendly" && (
          <FriendlyMatchesTab data={data} canManage={canEnterMatches} onEditMatch={editMatch} onDeleteMatch={deleteMatch} />
        )}

        {tab === "enter-match" && canEnterMatches && (
          <EnterMatchTab data={data} onAddMatch={addMatch} />
        )}
      </div>
    </div>
  );
}

/* ---------- Leaderboard ---------- */
function Leaderboard({ players, matches, history, onSelect }) {
  const PAGE_SIZE = 20;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => [...players].sort((a, b) => b.rating - a.rating), [players]);
  const rankMap = useMemo(() => {
    const m = new Map();
    sorted.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = normalizeVN(query.trim());
    if (!q) return sorted;
    return sorted.filter((p) => normalizeVN(`${p.name} ${p.nickname || ""}`).includes(q));
  }, [sorted, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const validPage = Math.min(page, totalPages);
  const paged = filtered.slice((validPage - 1) * PAGE_SIZE, validPage * PAGE_SIZE);

  if (players.length === 0) {
    return <EmptyState text="Chưa có vận động viên nào. Thêm VĐV ở tab “Vận động viên” để bắt đầu." />;
  }

  const cols = [
    { label: "Hạng", align: "left" },
    { label: "VĐV", align: "left" },
    { label: "Điểm hiện tại", align: "center" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SearchBox value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Tìm vận động viên theo tên…" />

      {filtered.length === 0 ? (
        <EmptyState text="Không tìm thấy vận động viên nào khớp." />
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
          <table>
            <thead>
              <tr style={{ background: C.ink }}>
                {cols.map((c) => (
                  <th key={c.label} style={{ textAlign: c.align, padding: "13px 16px", fontSize: 11.5, color: "#AEB4C9", fontWeight: 700, fontStyle: "italic", letterSpacing: 0.4, textTransform: "uppercase" }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const rankNum = rankMap.get(p.id);
                return (
                  <tr key={p.id} data-row onClick={() => onSelect(p)} style={{ borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
                    <td className="tabular" style={{ padding: "12px 16px", textAlign: "left", fontStyle: "italic", fontWeight: 800, color: C.muted }}>#{rankNum}</td>
                    <td style={{ padding: "12px 16px", textAlign: "left" }}>
                      <div className="flex items-center gap-3">
                        <Avatar player={p} size={34} />
                        <div>
                          <div style={{ fontWeight: 700, color: C.nameColor }}>{p.name}</div>
                          <div style={{ fontSize: 11.5, color: HANG_COLOR[p.hang], fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
                            Hạng {p.hang}{p.nickname ? ` · ${p.nickname}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <ScorePill value={p.rating} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ borderTop: `1px solid ${C.line}` }}>
            <Pagination page={validPage} totalPages={totalPages} onChange={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Players ---------- */
function PlayersTab({ players, canManage, onAdd, onSelect }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [initRating, setInitRating] = useState(1000);
  const [birthYear, setBirthYear] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const filteredPlayers = useMemo(() => {
    const q = normalizeVN(query.trim());
    if (!q) return players;
    return players.filter((p) => normalizeVN(`${p.name} ${p.nickname || ""}`).includes(q));
  }, [players, query]);

  function onPickPhoto(e) {
    const file = e.target.files?.[0] || null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError("");
    try {
      await onAdd({
        name: name.trim(), nickname: nickname.trim(), initRating: Number(initRating) || 1000,
        birthYear: birthYear ? Number(birthYear) : null, idNumber: idNumber.trim(), photoFile,
      });
      setName(""); setNickname(""); setInitRating(1000); setBirthYear(""); setIdNumber("");
      setPhotoFile(null); setPhotoPreview(null); setOpen(false);
    } catch (err) {
      setError(err.message || "Có lỗi khi lưu VĐV.");
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div>
          {!open ? (
            <button style={btnPrimary} onClick={() => setOpen(true)}>+ Thêm vận động viên</button>
          ) : (
            <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }} className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.bg, border: `1.5px dashed ${C.line}` }} />
                )}
                <label style={{ ...btnGhost, display: "inline-block", cursor: "pointer" }}>
                  {photoFile ? "Đổi ảnh" : "Tải ảnh lên"}
                  <input type="file" accept="image/*" onChange={onPickPhoto} style={{ display: "none" }} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Họ tên"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
                <Field label="Biệt danh (tuỳ chọn)"><input style={inputStyle} value={nickname} onChange={(e) => setNickname(e.target.value)} /></Field>
                <Field label="Điểm rating khởi tạo"><input type="number" style={inputStyle} value={initRating} onChange={(e) => setInitRating(e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Năm sinh (tuỳ chọn)"><input type="number" placeholder="VD: 1998" style={inputStyle} value={birthYear} onChange={(e) => setBirthYear(e.target.value)} /></Field>
                <Field label="CCCD (tuỳ chọn)"><input style={inputStyle} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} /></Field>
              </div>
              {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
              <div className="flex gap-2">
                <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Đang lưu…" : "Lưu VĐV"}</button>
                <button type="button" style={btnGhost} onClick={() => setOpen(false)}>Huỷ</button>
              </div>
            </form>
          )}
        </div>
      )}

      <SearchBox value={query} onChange={setQuery} placeholder="Tìm vận động viên theo tên…" />

      {filteredPlayers.length === 0 ? (
        <EmptyState text={players.length === 0 ? "Chưa có vận động viên nào." : "Không tìm thấy vận động viên nào khớp."} />
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          {filteredPlayers.map((p, i) => (
            <div key={p.id} data-row onClick={() => onSelect(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: i < filteredPlayers.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" }}>
              <div className="flex items-center gap-3">
                <Avatar player={p} size={38} />
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}{p.nickname ? ` · ${p.nickname}` : ""}</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>Tham gia {fmtDate(p.join_date)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <HangBadge hang={p.hang} />
                <ScorePill value={p.rating} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerDetail({ player, history, canManage, onEdit, onBack }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [nickname, setNickname] = useState(player.nickname || "");
  const [birthYear, setBirthYear] = useState(player.birth_year || "");
  const [idNumber, setIdNumber] = useState(player.id_number || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const chronoHistory = useMemo(() => [...history].reverse(), [history]); // API trả mới nhất trước → đảo lại cho biểu đồ
  const chartData = useMemo(() => {
    const points = chronoHistory.map((h, i) => ({ idx: i + 1, rating: h.after }));
    return [{ idx: 0, rating: chronoHistory.length ? chronoHistory[0].before : player.rating }, ...points];
  }, [chronoHistory, player.rating]);

  function startEdit() {
    setName(player.name); setNickname(player.nickname || "");
    setBirthYear(player.birth_year || ""); setIdNumber(player.id_number || "");
    setPhotoFile(null); setPhotoPreview(null);
    setEditing(true);
  }
  function onPickPhoto(e) {
    const file = e.target.files?.[0] || null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }
  async function saveEdit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError("");
    try {
      await onEdit(player.id, {
        name: name.trim(), nickname: nickname.trim(),
        birthYear: birthYear ? Number(birthYear) : null, idNumber: idNumber.trim(), photoFile,
      });
      setEditing(false);
    } catch (err) {
      setError(err.message || "Có lỗi khi lưu.");
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <button style={{ ...btnGhost, alignSelf: "flex-start" }} onClick={onBack}>← Quay lại danh sách</button>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        {!editing ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar player={player} size={52} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONT_DISPLAY }}>{player.name}</div>
                  {player.nickname && <div style={{ color: C.muted, fontSize: 13 }}>{player.nickname}</div>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <HangBadge hang={player.hang} />
                <ScorePill value={player.rating} style={{ fontSize: 18, padding: "6px 16px" }} />
              </div>
            </div>
            {(player.birth_year || player.id_number) && (
              <div className="flex gap-5" style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 13.5 }}>
                {player.birth_year && <div><span style={{ color: C.muted }}>Năm sinh: </span><span style={{ fontWeight: 600 }}>{player.birth_year}</span></div>}
                {player.id_number && <div><span style={{ color: C.muted }}>CCCD: </span><span style={{ fontWeight: 600 }}>{player.id_number}</span></div>}
              </div>
            )}
            {canManage && <button style={{ ...btnGhost, marginTop: 14 }} onClick={startEdit}>Chỉnh sửa thông tin</button>}
          </>
        ) : (
          <form onSubmit={saveEdit} className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              {photoPreview ? (
                <img src={photoPreview} alt="preview" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <Avatar player={player} size={64} />
              )}
              <label style={{ ...btnGhost, display: "inline-block", cursor: "pointer" }}>
                Đổi ảnh
                <input type="file" accept="image/*" onChange={onPickPhoto} style={{ display: "none" }} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Họ tên"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
              <Field label="Biệt danh (tuỳ chọn)"><input style={inputStyle} value={nickname} onChange={(e) => setNickname(e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Năm sinh (tuỳ chọn)"><input type="number" style={inputStyle} value={birthYear} onChange={(e) => setBirthYear(e.target.value)} /></Field>
              <Field label="CCCD (tuỳ chọn)"><input style={inputStyle} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} /></Field>
            </div>
            {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
            <div className="flex gap-2">
              <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button>
              <button type="button" style={btnGhost} onClick={() => setEditing(false)}>Huỷ</button>
            </div>
          </form>
        )}
      </div>

      {chartData.length > 1 && (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="idx" hide />
              <YAxis domain={["dataMin - 20", "dataMax + 20"]} tick={{ fontSize: 12, fill: C.muted }} width={44} />
              <Tooltip />
              <Line type="monotone" dataKey="rating" stroke={C.accent} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14 }}>
        <div style={{ padding: "12px 16px", fontWeight: 700, borderBottom: `1px solid ${C.line}` }}>Lịch sử điểm</div>
        {history.length === 0 ? (
          <div style={{ padding: 16 }}><EmptyState text="Chưa có lịch sử điểm." /></div>
        ) : (
          history.map((h, i, arr) => (
            <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <div>
                <div className="flex items-center gap-2" style={{ fontSize: 13.5 }}>
                  {h.match_result && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999,
                      background: h.match_result === "thắng" ? C.pillUpBg : C.pillDownBg,
                      color: h.match_result === "thắng" ? C.pillUpText : C.pillDownText,
                    }}>
                      {h.match_result === "thắng" ? "Thắng" : "Thua"} {h.match_score}
                    </span>
                  )}
                  <span>{h.reason}</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtDate(h.date)}</div>
              </div>
              <div className="tabular" style={{ fontWeight: 700, color: h.is_doubles ? C.muted : h.delta >= 0 ? "#1E8E52" : C.bad, fontSize: h.is_doubles ? 12 : 14 }}>
                {h.is_doubles ? "Không tính điểm" : <>{h.delta >= 0 ? "+" : ""}{h.delta}</>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Match row (dùng chung: có thể sửa/xóa) ---------- */
function MatchRow({ match: m, data, canManage, onEditMatch, onDeleteMatch, showDate }) {
  const isDoubles = m.mode === "doi";
  const [editing, setEditing] = useState(false);
  const [playerAId, setPlayerAId] = useState(m.player_a);
  const [playerA2Id, setPlayerA2Id] = useState(m.player_a2 || "");
  const [playerBId, setPlayerBId] = useState(m.player_b);
  const [playerB2Id, setPlayerB2Id] = useState(m.player_b2 || "");
  const [setsA, setSetsA] = useState(m.sets_a);
  const [setsB, setSetsB] = useState(m.sets_b);
  const [date, setDate] = useState(m.date);
  const [error, setError] = useState("");

  const pA = data.players.find((p) => p.id === m.player_a);
  const pB = data.players.find((p) => p.id === m.player_b);
  const pA2 = isDoubles ? data.players.find((p) => p.id === m.player_a2) : null;
  const pB2 = isDoubles ? data.players.find((p) => p.id === m.player_b2) : null;
  const labelA = isDoubles ? `${pA?.name} & ${pA2?.name}` : pA?.name;
  const labelB = isDoubles ? `${pB?.name} & ${pB2?.name}` : pB?.name;

  async function save(e) {
    e.preventDefault();
    setError("");
    if (Number(setsA) === Number(setsB)) return;
    try {
      if (isDoubles) {
        if (!playerAId || !playerA2Id || !playerBId || !playerB2Id) return;
        await onEditMatch(m.id, { playerAId: Number(playerAId), playerA2Id: Number(playerA2Id), playerBId: Number(playerBId), playerB2Id: Number(playerB2Id), setsA: Number(setsA), setsB: Number(setsB), date });
      } else {
        if (!playerAId || !playerBId || playerAId === playerBId) return;
        await onEditMatch(m.id, { playerAId: Number(playerAId), playerBId: Number(playerBId), setsA: Number(setsA), setsB: Number(setsB), date });
      }
      setEditing(false);
    } catch (err) {
      setError(err.message || "Có lỗi khi lưu.");
    }
  }

  async function remove() {
    const label = `${labelA} ${m.sets_a}–${m.sets_b} ${labelB}`;
    const confirmMsg = isDoubles ? `Xóa trận đấu ${label}?` : `Xóa trận đấu ${label}? Điểm của cả 2 VĐV sẽ được hoàn tác.`;
    if (window.confirm(confirmMsg)) {
      await onDeleteMatch(m.id);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} style={{ padding: "10px 0", borderBottom: `1px solid ${C.line}` }} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select style={inputStyle} value={playerAId} onChange={(e) => setPlayerAId(e.target.value)}>
            {data.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select style={inputStyle} value={playerBId} onChange={(e) => setPlayerBId(e.target.value)}>
            {data.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {isDoubles && (
          <div className="grid grid-cols-2 gap-2">
            <select style={inputStyle} value={playerA2Id} onChange={(e) => setPlayerA2Id(e.target.value)}>
              <option value="">— đồng đội VĐV A —</option>
              {data.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select style={inputStyle} value={playerB2Id} onChange={(e) => setPlayerB2Id(e.target.value)}>
              <option value="">— đồng đội VĐV B —</option>
              {data.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min="0" style={inputStyle} value={setsA} onChange={(e) => setSetsA(e.target.value)} />
          <input type="number" min="0" style={inputStyle} value={setsB} onChange={(e) => setSetsB(e.target.value)} />
        </div>
        {showDate && <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />}
        {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
        <div className="flex gap-2">
          <button type="submit" style={{ ...btnPrimary, padding: "6px 14px", fontSize: 13 }}>Lưu</button>
          <button type="button" style={{ ...btnGhost, padding: "6px 14px", fontSize: 13 }} onClick={() => setEditing(false)}>Huỷ</button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: 13.5, borderBottom: `1px solid ${C.line}` }}>
      <div>
        <div className="flex items-center gap-2">
          {isDoubles && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: "1px 7px" }}>ĐÔI</span>}
          <span>{labelA} {m.sets_a}–{m.sets_b} {labelB}</span>
        </div>
        {showDate && <div style={{ fontSize: 12, color: C.muted }}>{fmtDate(m.date)}</div>}
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular" style={{ color: C.muted }}>
          {isDoubles ? "Không tính điểm" : <>{m.delta_a >= 0 ? "+" : ""}{m.delta_a} / {m.delta_b >= 0 ? "+" : ""}{m.delta_b}</>}
        </span>
        {canManage && (
          <div className="flex gap-1">
            <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => setEditing(true)}>Sửa</button>
            <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, color: C.bad, borderColor: C.bad + "55" }} onClick={remove}>Xóa</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Tournaments ---------- */
function TournamentsTab({ data, canCreate, canEnterResults, canEnterMatches, onAddTournament, onCloseTournament, onAddResult, onEditMatch, onDeleteMatch }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("khong_chap");
  const [date, setDate] = useState(todayStr());
  const [expanded, setExpanded] = useState(null);
  const [yearFilter, setYearFilter] = useState("all");

  const years = useMemo(() => {
    const s = new Set(data.tournaments.map((t) => t.date.slice(0, 4)));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [data.tournaments]);

  const filteredTournaments = useMemo(() => {
    const list = [...data.tournaments];
    if (yearFilter === "all") return list;
    return list.filter((t) => t.date.slice(0, 4) === yearFilter);
  }, [data.tournaments, yearFilter]);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onAddTournament({ name: name.trim(), type, date });
    setName(""); setType("khong_chap"); setDate(todayStr()); setOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <div>
          {!open ? (
            <button style={btnPrimary} onClick={() => setOpen(true)}>+ Tạo giải đấu</button>
          ) : (
            <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }} className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Tên giải"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
                <Field label="Loại giải">
                  <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="khong_chap">Không chấp điểm</option>
                    <option value="co_chap">Có chấp điểm</option>
                  </select>
                </Field>
                <Field label="Ngày tổ chức"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              </div>
              <div className="flex gap-2">
                <button type="submit" style={btnPrimary}>Tạo giải</button>
                <button type="button" style={btnGhost} onClick={() => setOpen(false)}>Huỷ</button>
              </div>
            </form>
          )}
        </div>
      )}

      {data.tournaments.length > 0 && (
        <Field label="Lọc theo năm">
          <select style={{ ...inputStyle, maxWidth: 200 }} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="all">Tất cả</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
      )}

      {data.tournaments.length === 0 ? (
        <EmptyState text="Chưa có giải đấu nào." />
      ) : filteredTournaments.length === 0 ? (
        <EmptyState text={`Không có giải đấu nào trong năm ${yearFilter}.`} />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTournaments.map((t) => (
            <TournamentCard
              key={t.id} tournament={t} data={data}
              expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              canEnterResults={canEnterResults} canEnterMatches={canEnterMatches}
              onCloseTournament={onCloseTournament} onAddResult={onAddResult}
              onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament: t, data, expanded, onToggle, canEnterResults, canEnterMatches, onCloseTournament, onAddResult, onEditMatch, onDeleteMatch }) {
  const matches = data.matches.filter((m) => m.tournament === t.id);
  const results = data.results.filter((r) => r.tournament === t.id);
  const [placement, setPlacement] = useState("vo_dich");
  const [playerId, setPlayerId] = useState("");

  function submitResult(e) {
    e.preventDefault();
    if (!playerId) return;
    onAddResult({ tournamentId: t.id, playerId: Number(playerId), placement });
    setPlayerId("");
  }

  const accentColor = t.type === "khong_chap" ? C.accent : "#1E8E52";

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderLeft: `4px solid ${accentColor}`, borderRadius: 10 }}>
      <div onClick={onToggle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", cursor: "pointer" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{t.name}</div>
          <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
            <TypeTag type={t.type} />
            <span style={{ fontSize: 12.5, color: C.muted }}>{fmtDate(t.date)}</span>
            <span style={{ fontSize: 12.5, color: t.status === "da_ket_thuc" ? C.muted : "#1E8E52", fontWeight: 600 }}>
              {t.status === "da_ket_thuc" ? "Đã kết thúc" : "Đang diễn ra"}
            </span>
          </div>
        </div>
        <span style={{ color: C.muted, fontSize: 13 }}>{expanded ? "Thu gọn ▲" : "Chi tiết ▼"}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: 16 }} className="flex flex-col gap-4">
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Trận đấu ({matches.length})</div>
            {matches.length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted }}>Chưa có trận nào trong giải này.</div>
            ) : (
              matches.map((m) => (
                <MatchRow key={m.id} match={m} data={data} canManage={canEnterMatches} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch} showDate={false} />
              ))
            )}
          </div>

          {results.length > 0 && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Thành tích</div>
              {results.map((r) => {
                const p = data.players.find((pl) => pl.id === r.player);
                return (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13.5 }}>
                    <span>{BONUS_LABEL[r.placement]} — {p?.name}</span>
                    <span className="tabular" style={{ color: "#1E8E52", fontWeight: 700 }}>+{r.bonus}</span>
                  </div>
                );
              })}
            </div>
          )}

          {canEnterResults && (
            <form onSubmit={submitResult} className="flex items-end gap-2" style={{ flexWrap: "wrap" }}>
              <Field label="Vận động viên">
                <select style={inputStyle} value={playerId} onChange={(e) => setPlayerId(e.target.value)} required>
                  <option value="">— chọn —</option>
                  {data.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Thành tích">
                <select style={inputStyle} value={placement} onChange={(e) => setPlacement(e.target.value)}>
                  <option value="vo_dich">Vô địch</option>
                  <option value="a_quan">Á quân</option>
                  <option value="hang_ba">Hạng Ba</option>
                  <option value="tu_ket">Tứ kết</option>
                </select>
              </Field>
              <button type="submit" style={btnPrimary}>+ Cộng điểm thưởng</button>
            </form>
          )}

          {canEnterResults && t.status !== "da_ket_thuc" && (
            <button style={{ ...btnGhost, alignSelf: "flex-start" }} onClick={() => onCloseTournament(t.id)}>Đóng giải đấu</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Enter match ---------- */
function EnterMatchTab({ data, onAddMatch }) {
  const openTournaments = data.tournaments.filter((t) => t.status !== "da_ket_thuc");
  const [kind, setKind] = useState(openTournaments.length > 0 ? "giai" : "giao_huu");
  const [mode, setMode] = useState("don");
  const [tournamentId, setTournamentId] = useState("");
  const [friendlyDate, setFriendlyDate] = useState(todayStr());
  const [playerAId, setPlayerAId] = useState("");
  const [playerBId, setPlayerBId] = useState("");
  const [playerA2Id, setPlayerA2Id] = useState("");
  const [playerB2Id, setPlayerB2Id] = useState("");
  const [setsA, setSetsA] = useState(3);
  const [setsB, setSetsB] = useState(0);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const t = kind === "giai" ? data.tournaments.find((x) => x.id === Number(tournamentId)) : null;
  const effectiveType = kind === "giai" ? t?.type : "giao_huu";
  const pA = data.players.find((p) => p.id === Number(playerAId));
  const pB = data.players.find((p) => p.id === Number(playerBId));
  const pA2 = data.players.find((p) => p.id === Number(playerA2Id));
  const pB2 = data.players.find((p) => p.id === Number(playerB2Id));

  const preview = useMemo(() => {
    if (!effectiveType || Number(setsA) === Number(setsB)) return null;
    if (mode === "doi") return null;
    if (!pA || !pB) return null;
    const winner = Number(setsA) > Number(setsB) ? "A" : "B";
    return computeMatchDeltaPreview(pA.rating, pB.rating, winner, effectiveType);
  }, [effectiveType, mode, pA, pB, setsA, setsB]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (Number(setsA) === Number(setsB)) return;
    if (kind === "giai" && !tournamentId) return;
    try {
      if (mode === "doi") {
        const ids = [playerAId, playerA2Id, playerBId, playerB2Id];
        if (ids.some((x) => !x) || new Set(ids).size !== 4) return;
        await onAddMatch({
          tournamentId: kind === "giai" ? Number(tournamentId) : null,
          friendlyDate: kind === "giao_huu" ? friendlyDate : undefined,
          mode: "doi",
          playerAId: Number(playerAId), playerA2Id: Number(playerA2Id),
          playerBId: Number(playerBId), playerB2Id: Number(playerB2Id),
          setsA: Number(setsA), setsB: Number(setsB),
        });
        setMsg(`Đã lưu: ${pA.name} & ${pA2.name} ${setsA}–${setsB} ${pB.name} & ${pB2.name}`);
        setPlayerAId(""); setPlayerA2Id(""); setPlayerBId(""); setPlayerB2Id("");
      } else {
        if (!playerAId || !playerBId || playerAId === playerBId) return;
        await onAddMatch({
          tournamentId: kind === "giai" ? Number(tournamentId) : null,
          friendlyDate: kind === "giao_huu" ? friendlyDate : undefined,
          playerAId: Number(playerAId), playerBId: Number(playerBId),
          setsA: Number(setsA), setsB: Number(setsB),
        });
        setMsg(`Đã lưu kết quả: ${pA.name} ${setsA}–${setsB} ${pB.name}`);
        setPlayerAId(""); setPlayerBId("");
      }
      setSetsA(3); setSetsB(0);
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setError(err.message || "Có lỗi khi lưu trận đấu.");
    }
  }

  if (data.players.length < 2) return <EmptyState text="Cần ít nhất 2 vận động viên để nhập trận đấu." />;

  return (
    <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Bối cảnh">
          <div className="flex gap-2">
            <button type="button" onClick={() => setKind("giai")} style={kind === "giai" ? btnPrimary : btnGhost}>Trong giải đấu</button>
            <button type="button" onClick={() => setKind("giao_huu")} style={kind === "giao_huu" ? btnPrimary : btnGhost}>Giao hữu</button>
          </div>
        </Field>
        <Field label="Thể thức">
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("don")} style={mode === "don" ? btnPrimary : btnGhost}>Đánh đơn</button>
            <button type="button" onClick={() => setMode("doi")} style={mode === "doi" ? btnPrimary : btnGhost}>Đánh đôi</button>
          </div>
        </Field>
      </div>

      {kind === "giai" ? (
        openTournaments.length === 0 ? (
          <div style={{ fontSize: 13.5, color: C.muted }}>Chưa có giải đấu nào đang diễn ra — tạo giải ở tab “Giải đấu”, hoặc chọn “Giao hữu” để nhập ngay không cần giải.</div>
        ) : (
          <Field label="Giải đấu">
            <select style={inputStyle} value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} required>
              <option value="">— chọn giải —</option>
              {openTournaments.map((tt) => <option key={tt.id} value={tt.id}>{tt.name} ({LOAI_GIAI_LABEL[tt.type]})</option>)}
            </select>
          </Field>
        )
      ) : (
        <Field label="Ngày diễn ra"><input type="date" style={inputStyle} value={friendlyDate} onChange={(e) => setFriendlyDate(e.target.value)} required /></Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Field label={mode === "doi" ? "Đội A — VĐV 1" : "VĐV A"}>
            <select style={inputStyle} value={playerAId} onChange={(e) => setPlayerAId(e.target.value)} required>
              <option value="">— chọn —</option>
              {data.players.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rating})</option>)}
            </select>
          </Field>
          {mode === "doi" && (
            <Field label="Đội A — VĐV 2">
              <select style={inputStyle} value={playerA2Id} onChange={(e) => setPlayerA2Id(e.target.value)} required>
                <option value="">— chọn —</option>
                {data.players.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rating})</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Field label={mode === "doi" ? "Đội B — VĐV 1" : "VĐV B"}>
            <select style={inputStyle} value={playerBId} onChange={(e) => setPlayerBId(e.target.value)} required>
              <option value="">— chọn —</option>
              {data.players.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rating})</option>)}
            </select>
          </Field>
          {mode === "doi" && (
            <Field label="Đội B — VĐV 2">
              <select style={inputStyle} value={playerB2Id} onChange={(e) => setPlayerB2Id(e.target.value)} required>
                <option value="">— chọn —</option>
                {data.players.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rating})</option>)}
              </select>
            </Field>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={mode === "doi" ? "Số ván thắng — Đội A" : "Số ván thắng — VĐV A"}><input type="number" min="0" style={inputStyle} value={setsA} onChange={(e) => setSetsA(e.target.value)} /></Field>
        <Field label={mode === "doi" ? "Số ván thắng — Đội B" : "Số ván thắng — VĐV B"}><input type="number" min="0" style={inputStyle} value={setsB} onChange={(e) => setSetsB(e.target.value)} /></Field>
      </div>

      {mode === "doi" ? (
        <div style={{ fontSize: 13.5, color: C.muted, background: C.bg, borderRadius: 8, padding: "10px 12px" }}>
          Trận đánh đôi chỉ ghi nhận kết quả (tỷ số, thắng/thua) — không cộng/trừ điểm rating cho các VĐV.
        </div>
      ) : (
        preview && (
          <div style={{ fontSize: 13.5, color: C.muted, background: C.bg, borderRadius: 8, padding: "10px 12px" }}>
            Dự kiến: <strong style={{ color: C.ink }}>{pA?.name}</strong> {preview.deltaA >= 0 ? "+" : ""}{preview.deltaA} điểm,{" "}
            <strong style={{ color: C.ink }}>{pB?.name}</strong> {preview.deltaB >= 0 ? "+" : ""}{preview.deltaB} điểm
          </div>
        )
      )}

      {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}

      <div className="flex items-center gap-3">
        <button type="submit" style={btnPrimary} disabled={kind === "giai" && openTournaments.length === 0}>Lưu kết quả trận đấu</button>
        {msg && <span style={{ fontSize: 13, color: "#1E8E52", fontWeight: 600 }}>{msg}</span>}
      </div>
    </form>
  );
}

/* ---------- Friendly matches log ---------- */
function FriendlyMatchesTab({ data, canManage, onEditMatch, onDeleteMatch }) {
  const [yearFilter, setYearFilter] = useState("all");

  const allFriendly = useMemo(
    () => data.matches.filter((m) => !m.tournament).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.matches]
  );
  const years = useMemo(() => {
    const s = new Set(allFriendly.map((m) => m.date.slice(0, 4)));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [allFriendly]);
  const friendly = yearFilter === "all" ? allFriendly : allFriendly.filter((m) => m.date.slice(0, 4) === yearFilter);

  if (allFriendly.length === 0) {
    return <EmptyState text="Chưa có trận giao hữu nào. Vào tab “Nhập trận đấu” → chọn “Giao hữu” để nhập." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Lọc theo năm">
        <select style={{ ...inputStyle, maxWidth: 200 }} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="all">Tất cả</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </Field>

      {friendly.length === 0 ? (
        <EmptyState text={`Không có trận giao hữu nào trong năm ${yearFilter}.`} />
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "0 16px" }}>
          {friendly.map((m) => (
            <MatchRow key={m.id} match={m} data={data} canManage={canManage} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch} showDate />
          ))}
        </div>
      )}
    </div>
  );
}
