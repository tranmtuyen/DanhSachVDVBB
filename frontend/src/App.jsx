import React, { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ======================================================================
   Địa chỉ backend Django. MẶC ĐỊNH RỖNG = gọi API cùng domain (đúng cho
   cách deploy hiện tại: Nginx phục vụ chung 1 domain cho cả frontend+backend).
   Chỉ cần đặt biến môi trường VITE_API_ORIGIN nếu backend nằm ở domain KHÁC
   (ví dụ chạy "npm run dev" cục bộ trỏ sang VPS, hoặc tách domain riêng sau này).
   ====================================================================== */
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || "";
const API = `${API_ORIGIN}/api`;

/* ---------- Design tokens (tham khảo phong cách bongbantv.com.vn) ---------- */
const C = {
  bg: "#F4F5FA",
  surface: "#FFFFFF",
  ink: "#003659",       // navy logo
  muted: "#7A8194",
  line: "#E9EAF2",
  nameColor: "#003659",
  accent: "#FF1135",     // đỏ logo
  accentSoft: "#0E7FA3", // cyan/navy nhạt logo — dùng làm gradient
  gold: "#E3A13B",
  silver: "#9AA1B3",
  bronze: "#B77F4E",
  pillUpBg: "#E4F6EA", pillUpText: "#1E8E52",
  pillDownBg: "#FBE7E6", pillDownText: "#D6453B",
  pillScoreBg: "#EEE9FB", pillScoreText: "#6B3FC7",
  bad: "#D6453B",
};

const HANG_COLOR = {
  "Chuyên": "#7C3AED", A: "#2563EB", B: "#0891B2", C: "#059669",
  D: "#1E8E52", E: "#3E8B62", F: "#B8862B", G: "#C9772E", H: "#8A8A85",
};
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

/* Lấy "Tên" (chữ cuối cùng trong Họ tên đầy đủ kiểu Việt Nam) để sắp xếp ABC theo Tên, không phải Họ */
function tenRieng(fullName) {
  const parts = (fullName || "").trim().split(/\s+/);
  return parts[parts.length - 1] || "";
}

const ROLE_LABEL = {
  admin: "Quản trị viên",
  manager: "Quản lý giải đấu",
  scorer: "Người nhập liệu",
  user: "Người dùng",
  public: "Công khai (xem)",
};

/* Token đăng nhập — được App() cập nhật mỗi khi trạng thái đăng nhập thay đổi */
let authToken = null;
function setAuthToken(t) { authToken = t; }
function authHeaders(extra) {
  return authToken ? { ...extra, Authorization: `Token ${authToken}` } : { ...extra };
}

/* ---------- API helpers ---------- */
async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${path} thất bại (${res.status})`);
  return res.json();
}
async function apiPostJSON(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
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
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || JSON.stringify(err) || `PATCH ${path} thất bại`);
  }
  return res.json();
}
async function apiForm(path, method, formData) {
  const res = await fetch(`${API}${path}`, { method, headers: authHeaders(), body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || JSON.stringify(err) || `${method} ${path} thất bại`);
  }
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(`${API}${path}`, { method: "DELETE", headers: authHeaders() });
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
      className="inline-flex items-center gap-1 rounded-full"
      style={{
        background: HANG_COLOR[hang] + "17", color: HANG_COLOR[hang], fontFamily: FONT_DISPLAY,
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.1, padding: "2px 8px", whiteSpace: "nowrap",
      }}
    >
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
function NameWithNickname({ name, nickname }) {
  return (
    <>
      {name}
      {nickname && <span style={{ color: C.muted, fontWeight: 500 }}> ({nickname})</span>}
    </>
  );
}

function PlayerCombobox({ players, value, onChange, placeholder, excludeIds }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hoverId, setHoverId] = useState(null);
  const selected = players.find((p) => p.id === Number(value));

  const available = useMemo(
    () => (excludeIds && excludeIds.length ? players.filter((p) => !excludeIds.includes(p.id)) : players),
    [players, excludeIds]
  );

  const filtered = useMemo(() => {
    const q = normalizeVN(query.trim());
    if (!q) return available;
    return available.filter((p) => normalizeVN(`${p.name} ${p.nickname || ""}`).includes(q));
  }, [available, query]);

  return (
    <div style={{ position: "relative" }}>
      <input
        style={{ ...inputStyle, width: "100%", paddingRight: 34, cursor: open ? "text" : "pointer" }}
        value={open ? query : selected ? `${selected.name}${selected.nickname ? ` (${selected.nickname})` : ""}` : ""}
        placeholder={placeholder || (open ? "Gõ để tìm theo tên hoặc biệt danh…" : "— Chọn VĐV —")}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      <span
        style={{
          position: "absolute", right: 12, top: "50%", transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          color: C.muted, fontSize: 11, pointerEvents: "none", transition: "transform 120ms ease",
        }}
      >
        ▼
      </span>
      {open && (
        <div
          className="tt-combobox-scroll"
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, background: C.surface,
            border: `1px solid ${C.line}`, borderRadius: 10, maxHeight: 260, overflowY: "auto", zIndex: 45,
            boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: C.muted }}>Không tìm thấy VĐV nào khớp.</div>
          ) : (
            filtered.map((p) => (
              <div
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); onChange(String(p.id)); setQuery(""); setOpen(false); }}
                onMouseEnter={() => setHoverId(p.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  padding: "11px 14px", fontSize: 13.5, cursor: "pointer",
                  background: p.id === Number(value) ? C.bg : hoverId === p.id ? "#F7F4FB" : "transparent",
                  borderBottom: `1px solid ${C.line}`,
                }}
              >
                <NameWithNickname name={p.name} nickname={p.nickname} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MatchTeamsGrid({ leftP1, leftP2, rightP1, rightP2, middle }) {
  const hasSecondRow = !!(leftP2 || rightP2);
  const nameStyle = { textAlign: "left", color: C.nameColor, fontWeight: 700 };
  return (
    <div className="tt-teams-grid" style={{ display: "grid", gridTemplateColumns: "minmax(120px,1fr) 78px minmax(120px,1fr)", width: "100%", alignItems: "center", rowGap: 1, columnGap: 10 }}>
      <div className="tt-tg-1" style={nameStyle}>{leftP1?.name}</div>
      <div
        className="tt-tg-mid tabular"
        style={{
          gridRow: hasSecondRow ? "span 2" : "auto", alignSelf: "center",
          textAlign: "center", fontSize: 13, fontWeight: 800, color: C.ink, whiteSpace: "nowrap",
        }}
      >
        {middle}
      </div>
      <div className="tt-tg-2" style={nameStyle}>{rightP1?.name}</div>
      {hasSecondRow && (
        <>
          <div className="tt-tg-3" style={nameStyle}>{leftP2?.name}</div>
          <div className="tt-tg-4" style={nameStyle}>{rightP2?.name}</div>
        </>
      )}
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

function NavIcon({ name }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "leaderboard") return <svg {...p}><path d="M4 20V11M12 20V4M20 20v-6" /></svg>;
  if (name === "players") return <svg {...p}><circle cx="12" cy="8" r="3.3" /><path d="M5 20c0-4 3-6.2 7-6.2s7 2.2 7 6.2" /></svg>;
  if (name === "tournament") return <svg {...p}><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4.7A1.7 1.7 0 0 0 3 7.7c0 2 1.5 3.4 3 3.6M17 6h2.3A1.7 1.7 0 0 1 21 7.7c0 2-1.5 3.4-3 3.6" /><path d="M12 13v3M9.5 20h5M10.2 17h3.6v3h-3.6z" /></svg>;
  if (name === "friendly") return <svg {...p}><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M2.5 20c0-3.3 2.5-5.5 5.5-5.5M21.5 20c0-3.3-2.5-5.5-5.5-5.5" /></svg>;
  if (name === "enter") return <svg {...p}><path d="M4 20h4l10.2-10.2-4-4L4 16v4Z" /><path d="M13.2 6.8l4 4" /></svg>;
  if (name === "users") return <svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /></svg>;
  return null;
}
function LoginIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17l5-5-5-5M15 12H3M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    </svg>
  );
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
  const [token, setToken] = useState(() => localStorage.getItem("tt_token") || null);
  const [currentUser, setCurrentUser] = useState(null); // {username, role}
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState("leaderboard");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = currentUser?.role || "public";

  useEffect(() => {
    setAuthToken(token);
    if (!token) { setCurrentUser(null); setAuthChecked(true); return; }
    (async () => {
      try {
        const me = await apiGet("/auth/me/");
        setCurrentUser(me);
      } catch {
        localStorage.removeItem("tt_token");
        setToken(null);
        setCurrentUser(null);
      }
      setAuthChecked(true);
    })();
  }, [token]);

  async function login(username, password) {
    const res = await apiPostJSON("/auth/login/", { username, password });
    localStorage.setItem("tt_token", res.token);
    setToken(res.token);
    setCurrentUser({ id: res.id, username: res.username, role: res.role });
  }
  async function logout() {
    try { await apiPostJSON("/auth/logout/", {}); } catch {}
    localStorage.removeItem("tt_token");
    setToken(null);
    setCurrentUser(null);
  }
  function updateToken(newToken) {
    localStorage.setItem("tt_token", newToken);
    setToken(newToken);
  }

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

  async function editPlayer(playerId, { name, nickname, birthYear, idNumber, photoFile, newRating }) {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("nickname", nickname || "");
    fd.append("birth_year", birthYear ? String(birthYear) : "");
    fd.append("id_number", idNumber || "");
    if (photoFile) fd.append("photo", photoFile);
    await apiForm(`/players/${playerId}/`, "PATCH", fd);
    if (newRating !== undefined && newRating !== null) {
      await apiPostJSON(`/players/${playerId}/adjust_rating/`, { rating: newRating });
    }
    await refreshAll();
  }

  async function deletePlayer(playerId) {
    await apiDelete(`/players/${playerId}/`);
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

  async function deleteTournament(tid) {
    await apiDelete(`/tournaments/${tid}/`);
    await refreshAll();
  }

  async function addMatch({ tournamentId, mode, status, playerAId, playerBId, playerA2Id, playerB2Id, setsA, setsB, friendlyDate }) {
    await apiPostJSON("/matches/", {
      tournament: tournamentId || null,
      mode: mode || "don",
      status: status || "completed",
      player_a: playerAId, player_b: playerBId,
      player_a2: playerA2Id || null, player_b2: playerB2Id || null,
      sets_a: setsA ?? null, sets_b: setsB ?? null,
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

  async function createUser({ username, password, newRole }) {
    return apiPostJSON("/users/", { username, password, new_role: newRole });
  }
  async function updateUserRole(userId, newRole) {
    return apiPatchJSON(`/users/${userId}/`, { new_role: newRole });
  }
  async function resetUserPassword(userId, password) {
    return apiPatchJSON(`/users/${userId}/`, { password });
  }

  const canManagePlayers = role === "admin";
  const canManageTournaments = role === "admin" || role === "manager";
  const canEnterResults = role === "admin" || role === "manager";
  const canEnterMatches = role === "admin" || role === "manager" || role === "scorer";
  const canManageMatches = role === "admin"; // chỉ Quản trị viên được sửa/xóa trận đấu

  const visibleTabs = [
    { id: "leaderboard", label: "Bảng xếp hạng", icon: "leaderboard", show: true },
    { id: "players", label: "Vận động viên", icon: "players", show: true },
    { id: "tournaments", label: "Giải đấu", icon: "tournament", show: true },
    { id: "friendly", label: "Giao hữu", icon: "friendly", show: true },
    { id: "enter-match", label: "Nhập trận đấu", icon: "enter", show: canEnterMatches },
    { id: "users", label: "Quản lý User", icon: "users", show: role === "admin" },
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
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT_BODY, color: C.ink, display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;0,800;1,600;1,700&family=Nunito:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; }
        .tabular { font-variant-numeric: tabular-nums; font-family: ${FONT_DISPLAY}; }
        button { transition: transform 120ms ease, opacity 120ms ease; }
        button:hover { transform: translateY(-1px); }
        button:active { transform: translateY(0); }
        select, input { font-family: inherit; }
        input:focus, select:focus { border-color: ${C.accent} !important; }
        tr[data-row]:hover { background: ${C.bg}; }
        .tt-combobox-scroll::-webkit-scrollbar { width: 8px; }
        .tt-combobox-scroll::-webkit-scrollbar-track { background: transparent; }
        .tt-combobox-scroll::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 8px; }
        .tt-combobox-scroll { scrollbar-width: thin; scrollbar-color: ${C.line} transparent; }
        @media (max-width: 480px) {
          .tt-match-row { flex-direction: column; align-items: stretch !important; gap: 6px !important; }
          .tt-match-right { width: 100%; justify-content: space-between !important; }
          .tt-teams-grid { grid-template-columns: 1fr !important; row-gap: 3px !important; }
          .tt-teams-grid > div { grid-column: 1 !important; grid-row: auto !important; text-align: center !important; }
          .tt-tg-1 { order: 1; }
          .tt-tg-3 { order: 2; }
          .tt-tg-mid { order: 3; margin: 3px 0; }
          .tt-tg-2 { order: 4; }
          .tt-tg-4 { order: 5; }
        }
        .tt-sidebar { width: 232px; flex-shrink: 0; transition: width 160ms ease; }
        .tt-sidebar-label { display: inline; }
        .tt-mobile-toggle { display: none; }
        @media (max-width: 720px) {
          .tt-sidebar { width: 62px; }
          .tt-sidebar-label, .tt-sidebar-brand-text, .tt-sidebar-user-info { display: none !important; }
          .tt-nav-item { justify-content: center !important; }
          .tt-mobile-toggle { display: flex !important; }
          .tt-sidebar.tt-sidebar-open {
            width: 240px; position: fixed; top: 0; left: 0; height: 100vh; z-index: 60;
            box-shadow: 4px 0 24px rgba(0,0,0,0.35);
          }
          .tt-sidebar.tt-sidebar-open .tt-sidebar-label,
          .tt-sidebar.tt-sidebar-open .tt-sidebar-brand-text,
          .tt-sidebar.tt-sidebar-open .tt-sidebar-user-info { display: inline !important; }
          .tt-sidebar.tt-sidebar-open .tt-nav-item { justify-content: flex-start !important; }
          .tt-sidebar.tt-sidebar-open .tt-sidebar-nav { flex: 0 1 auto !important; }
        }
      `}</style>

      {mobileMenuOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 55 }} onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`tt-sidebar${mobileMenuOpen ? " tt-sidebar-open" : ""}`} style={{ background: C.ink, minHeight: "100vh", display: "flex", flexDirection: "column", position: "sticky", top: 0 }}>
        <button
          className="tt-mobile-toggle"
          onClick={() => setMobileMenuOpen((v) => !v)}
          style={{ alignItems: "center", justifyContent: "center", width: "100%", padding: "16px 0 4px", background: "transparent", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}
          aria-label="Mở menu"
        >
          {mobileMenuOpen ? "✕" : "☰"}
        </button>

        <div className="flex items-center gap-2.5" style={{ padding: "12px 18px 18px" }}>
          <img src="/logo-sao-mai.png" alt="CLB Sao Mai" style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }} />
          <div className="tt-sidebar-brand-text" style={{ lineHeight: 1.25 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 12, fontFamily: "'Nunito', sans-serif" }}>CLB BÓNG BÀN SAO MAI</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 12, fontFamily: "'Nunito', sans-serif" }}>AN GIANG</div>
          </div>
        </div>

        <div className="tt-sidebar-nav flex flex-col gap-1" style={{ padding: "8px 12px", flex: 1 }}>
          {visibleTabs.map((t) => (
            <button
              key={t.id} onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
              className="tt-nav-item flex items-center gap-2.5"
              style={{
                border: "none", cursor: "pointer", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                background: tab === t.id ? C.accent : "transparent",
                color: tab === t.id ? "#fff" : "#9BA89E", fontWeight: tab === t.id ? 700 : 500, fontSize: 13.5,
              }}
            >
              <NavIcon name={t.icon} />
              <span className="tt-sidebar-label" style={{ whiteSpace: "nowrap" }}>{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: 14, borderTop: "1px solid #212E27", position: "relative" }}>
          {!currentUser && (
            <button
              onClick={() => setShowLogin(true)}
              className="flex items-center justify-center gap-2"
              style={{
                width: "100%", border: "none", cursor: "pointer", padding: "11px 14px", borderRadius: 10,
                background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13.5,
              }}
            >
              <LoginIcon /> <span className="tt-sidebar-label">Đăng Nhập</span>
            </button>
          )}
        </div>
      </div>

      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onLogin={login} />
      )}

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} onTokenUpdated={updateToken} />
      )}

      {selectedPlayer && (
        <PlayerDetailModal onClose={() => setSelectedPlayer(null)}>
          <PlayerDetail
            key={selectedPlayer.id}
            player={players.find((p) => p.id === selectedPlayer.id) || selectedPlayer}
            history={history.filter((h) => h.player === selectedPlayer.id)}
            matches={matches}
            tournaments={tournaments}
            allPlayers={players}
            canManage={canManagePlayers}
            canManageMatches={canManageMatches}
            onEdit={editPlayer}
            onDeletePlayer={deletePlayer}
            onEditMatch={editMatch}
            onDeleteMatch={deleteMatch}
            onBack={() => setSelectedPlayer(null)}
          />
        </PlayerDetailModal>
      )}

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {currentUser && (
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 24px 0" }}>
            <UserMenu currentUser={currentUser} onLogout={logout} onChangePassword={() => setShowChangePassword(true)} />
          </div>
        )}
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px" }}>
          {loadError && (
            <div style={{ background: "#FBEAE7", color: C.bad, border: `1px solid ${C.bad}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13.5 }}>
              {loadError}
            </div>
          )}

          {tab === "leaderboard" && (
            <Leaderboard players={players} matches={matches} history={history} onSelect={setSelectedPlayer} />
          )}

          {tab === "players" && (
            <PlayersTab players={players} canManage={canManagePlayers} onAdd={addPlayer} onSelect={setSelectedPlayer} />
          )}

          {tab === "tournaments" && (
            <TournamentsTab
              data={data} canCreate={canManageTournaments} canEnterResults={canEnterResults} canEnterMatches={canEnterMatches} canManageMatches={canManageMatches}
              canDeleteTournament={role === "admin"}
              onAddTournament={addTournament} onCloseTournament={closeTournament} onDeleteTournament={deleteTournament} onAddResult={addResult}
              onEditMatch={editMatch} onDeleteMatch={deleteMatch}
            />
          )}

          {tab === "friendly" && (
            <FriendlyMatchesTab data={data} canManage={canManageMatches} onEditMatch={editMatch} onDeleteMatch={deleteMatch} />
          )}

          {tab === "enter-match" && canEnterMatches && (
            <EnterMatchTab data={data} onAddMatch={addMatch} />
          )}

          {tab === "users" && role === "admin" && (
            <UsersTab onCreateUser={createUser} onUpdateRole={updateUserRole} onResetPassword={resetUserPassword} />
          )}
        </div>
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
                          <div style={{ fontWeight: 700, color: C.nameColor }}>
                            <NameWithNickname name={p.name} nickname={p.nickname} />
                          </div>
                          <div style={{ fontSize: 11.5, color: HANG_COLOR[p.hang], fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
                            Hạng {p.hang}
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
const RANK_LEGEND = [
  { hang: "Chuyên", range: "> 2200" },
  { hang: "A", range: "2001 – 2200" },
  { hang: "B", range: "1801 – 2000" },
  { hang: "C", range: "1601 – 1800" },
  { hang: "D", range: "1401 – 1600" },
  { hang: "E", range: "1201 – 1400" },
  { hang: "F", range: "1001 – 1200" },
  { hang: "G", range: "801 – 1000" },
  { hang: "H", range: "< 800" },
];

function RankLegend() {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "10px 14px", overflowX: "auto", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginRight: 12 }}>
        Quy đổi hạng:
      </span>
      {RANK_LEGEND.map((r, i) => (
        <span key={r.hang} style={{ fontSize: 12, marginRight: i < RANK_LEGEND.length - 1 ? 14 : 0 }}>
          <span style={{ fontWeight: 700, color: HANG_COLOR[r.hang] }}>Hạng {r.hang}</span>
          <span style={{ color: C.muted }}> {r.range}</span>
        </span>
      ))}
    </div>
  );
}

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

  const sortedByTen = useMemo(
    () => [...players].sort((a, b) => tenRieng(a.name).localeCompare(tenRieng(b.name), "vi")),
    [players]
  );

  const filteredPlayers = useMemo(() => {
    const q = normalizeVN(query.trim());
    if (!q) return sortedByTen;
    return sortedByTen.filter((p) => normalizeVN(`${p.name} ${p.nickname || ""}`).includes(q));
  }, [sortedByTen, query]);

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
      <RankLegend />

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
                  <div style={{ fontWeight: 600 }}><NameWithNickname name={p.name} nickname={p.nickname} /></div>
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

function PlayerDetail({ player, history, matches, tournaments, allPlayers, canManage, canManageMatches, onEdit, onDeletePlayer, onEditMatch, onDeleteMatch, onBack }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);
  const [nickname, setNickname] = useState(player.nickname || "");
  const [birthYear, setBirthYear] = useState(player.birth_year || "");
  const [idNumber, setIdNumber] = useState(player.id_number || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [rating, setRating] = useState(player.rating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 20;

  const chronoHistory = useMemo(() => [...history].reverse(), [history]); // API trả mới nhất trước → đảo lại cho biểu đồ
  const chartData = useMemo(() => {
    const points = chronoHistory.map((h, i) => ({ idx: i + 1, rating: h.after }));
    return [{ idx: 0, rating: chronoHistory.length ? chronoHistory[0].before : player.rating }, ...points];
  }, [chronoHistory, player.rating]);

  function startEdit() {
    setName(player.name); setNickname(player.nickname || "");
    setBirthYear(player.birth_year || ""); setIdNumber(player.id_number || "");
    setPhotoFile(null); setPhotoPreview(null); setRating(player.rating);
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
        newRating: Number(rating) !== player.rating ? Number(rating) : undefined,
      });
      setEditing(false);
    } catch (err) {
      setError(err.message || "Có lỗi khi lưu.");
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Nút quay lại đã thay bằng nút ✕ đóng popup ở PlayerDetailModal */}

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
            {canManage && (player.birth_year || player.id_number) && (
              <div className="flex gap-5" style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 13.5 }}>
                {player.birth_year && <div><span style={{ color: C.muted }}>Năm sinh: </span><span style={{ fontWeight: 600 }}>{player.birth_year}</span></div>}
                {player.id_number && <div><span style={{ color: C.muted }}>CCCD: </span><span style={{ fontWeight: 600 }}>{player.id_number}</span></div>}
              </div>
            )}
            {canManage && (
              <div className="flex gap-2" style={{ marginTop: 14 }}>
                <button style={btnGhost} onClick={startEdit}>Chỉnh sửa thông tin</button>
                <button
                  style={{ ...btnGhost, color: C.bad, borderColor: C.bad + "55" }}
                  onClick={async () => {
                    if (!window.confirm(
                      `Xóa vĩnh viễn VĐV "${player.name}"?\n\nToàn bộ trận đấu của VĐV này sẽ bị xóa, điểm của các VĐV từng thi đấu cùng sẽ được hoàn tác về đúng trước khi thi đấu. Hành động này không thể hoàn tác.`
                    )) return;
                    try {
                      await onDeletePlayer(player.id);
                      onBack();
                    } catch (err) {
                      alert(err.message || "Có lỗi khi xóa VĐV.");
                    }
                  }}
                >
                  Xóa VĐV
                </button>
              </div>
            )}
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
            <Field label="Điểm rating">
              <input type="number" style={inputStyle} value={rating} onChange={(e) => setRating(e.target.value)} />
            </Field>
            {Number(rating) !== player.rating && (
              <div style={{ fontSize: 12.5, color: C.gold, background: C.gold + "14", borderRadius: 8, padding: "8px 12px" }}>
                Sửa điểm thủ công sẽ ghi lại vào lịch sử điểm ({player.rating} → {rating}) — chỉ dùng khi thật sự cần chỉnh lại sai sót.
              </div>
            )}
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
          <>
            {history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((h, i, arr) => {
              const linkedMatch = h.match ? matches.find((m) => m.id === h.match) : null;
              if (linkedMatch) {
                return (
                  <div key={h.id} style={{ padding: "0 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <MatchRow
                      match={linkedMatch}
                      data={{ players: allPlayers, tournaments }}
                      canManage={canManageMatches}
                      onEditMatch={onEditMatch}
                      onDeleteMatch={onDeleteMatch}
                      showDate
                      perspectivePlayerId={player.id}
                    />
                  </div>
                );
              }
              return (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                  <div>
                    <div style={{ fontSize: 13.5 }}>{h.reason}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtDate(h.date)}</div>
                  </div>
                  <div className="tabular" style={{ fontWeight: 700, color: h.delta >= 0 ? "#1E8E52" : C.bad }}>
                    {h.delta >= 0 ? "+" : ""}{h.delta}
                  </div>
                </div>
              );
            })}
            <Pagination page={historyPage} totalPages={Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE))} onChange={setHistoryPage} />
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Match row (dùng chung: có thể sửa/xóa) ---------- */
function MatchRow({ match: m, data, canManage, onEditMatch, onDeleteMatch, showDate, perspectivePlayerId }) {
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

  // Hiển thị theo góc nhìn 1 VĐV cụ thể (dùng trong "Lịch sử điểm" của VĐV đó)
  let perspective = null;
  if (perspectivePlayerId && m.status !== "scheduled") {
    const isASide = m.player_a === perspectivePlayerId || m.player_a2 === perspectivePlayerId;
    const selfWon = (isASide && m.winner_side === "A") || (!isASide && m.winner_side === "B");
    const scoreText = isASide ? `${m.sets_a}–${m.sets_b}` : `${m.sets_b}–${m.sets_a}`;
    const contextLabel = m.tournament
      ? (data.tournaments?.find((t) => t.id === m.tournament)?.name || "Giải đấu")
      : "Giao hữu";
    perspective = { selfLabel: isASide ? labelA : labelB, oppLabel: isASide ? labelB : labelA, selfWon, scoreText, contextLabel, isASide };
  }

  // Xác định bên trái/phải hiển thị: theo góc nhìn (self bên trái) nếu có, mặc định A bên trái — dùng chung cho đơn & đôi
  const asideLeft = perspective ? perspective.isASide : true;
  const leftPlayers = isDoubles ? (asideLeft ? [pA, pA2] : [pB, pB2]) : [asideLeft ? pA : pB];
  const rightPlayers = isDoubles ? (asideLeft ? [pB, pB2] : [pA, pA2]) : [asideLeft ? pB : pA];

  async function save(e) {
    e.preventDefault();
    setError("");
    const aBlank = setsA === "" || setsA === null || setsA === undefined;
    const bBlank = setsB === "" || setsB === null || setsB === undefined;
    if (aBlank !== bBlank) { setError("Cần nhập đủ tỷ số cả 2 bên, hoặc để trống cả 2 nếu chưa có kết quả."); return; }
    const scoreProvided = !aBlank;
    if (scoreProvided && Number(setsA) === Number(setsB)) return;
    const finalSetsA = scoreProvided ? Number(setsA) : null;
    const finalSetsB = scoreProvided ? Number(setsB) : null;
    try {
      if (isDoubles) {
        if (!playerAId || !playerA2Id || !playerBId || !playerB2Id) return;
        await onEditMatch(m.id, { playerAId: Number(playerAId), playerA2Id: Number(playerA2Id), playerBId: Number(playerBId), playerB2Id: Number(playerB2Id), setsA: finalSetsA, setsB: finalSetsB, date });
      } else {
        if (!playerAId || !playerBId || playerAId === playerBId) return;
        await onEditMatch(m.id, { playerAId: Number(playerAId), playerBId: Number(playerBId), setsA: finalSetsA, setsB: finalSetsB, date });
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
          <input type="number" min="0" placeholder="Chưa có" style={inputStyle} value={setsA ?? ""} onChange={(e) => setSetsA(e.target.value)} />
          <input type="number" min="0" placeholder="Chưa có" style={inputStyle} value={setsB ?? ""} onChange={(e) => setSetsB(e.target.value)} />
        </div>
        <div style={{ fontSize: 11.5, color: C.muted }}>Để trống cả 2 ô nếu trận vẫn đang "Sắp diễn ra", chưa có kết quả.</div>
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
    <div className="tt-match-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: 13.5, borderBottom: `1px solid ${C.line}`, gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2" style={{ width: "100%" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: "1px 7px" }}>
            {isDoubles ? "ĐÔI" : "ĐƠN"}
          </span>
          {m.status === "scheduled" ? (
            <MatchTeamsGrid
              leftP1={leftPlayers[0]} leftP2={leftPlayers[1]} rightP1={rightPlayers[0]} rightP2={rightPlayers[1]}
              middle="(sắp diễn ra)"
            />
          ) : perspective ? (
            <>
              <span
                style={{
                  fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, marginRight: 2,
                  background: perspective.selfWon ? C.pillUpBg : C.pillDownBg,
                  color: perspective.selfWon ? C.pillUpText : C.pillDownText,
                }}
              >
                {perspective.selfWon ? "Thắng" : "Thua"}
              </span>
              <MatchTeamsGrid
                leftP1={leftPlayers[0]} leftP2={leftPlayers[1]} rightP1={rightPlayers[0]} rightP2={rightPlayers[1]}
                middle={perspective.scoreText}
              />
            </>
          ) : (
            <MatchTeamsGrid
              leftP1={leftPlayers[0]} leftP2={leftPlayers[1]} rightP1={rightPlayers[0]} rightP2={rightPlayers[1]}
              middle={`${m.sets_a}–${m.sets_b}`}
            />
          )}
        </div>
        {showDate && <div style={{ fontSize: 12, color: C.muted }}>{fmtDate(m.date)}</div>}
        {perspective && <div style={{ fontSize: 11.5, color: C.muted, opacity: 0.75, marginTop: 1 }}>{perspective.contextLabel}</div>}
      </div>
      <div className="tt-match-right flex items-center gap-3">
        <span className="tabular" style={{ color: C.muted }}>
          {m.status === "scheduled" ? "" : isDoubles ? "Không tính điểm" : <>{m.delta_a >= 0 ? "+" : ""}{m.delta_a} / {m.delta_b >= 0 ? "+" : ""}{m.delta_b}</>}
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
function TournamentsTab({ data, canCreate, canEnterResults, canEnterMatches, canManageMatches, canDeleteTournament, onAddTournament, onCloseTournament, onDeleteTournament, onAddResult, onEditMatch, onDeleteMatch }) {
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
              canEnterResults={canEnterResults} canEnterMatches={canEnterMatches} canManageMatches={canManageMatches}
              canDeleteTournament={canDeleteTournament}
              onCloseTournament={onCloseTournament} onDeleteTournament={onDeleteTournament} onAddResult={onAddResult}
              onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament: t, data, expanded, onToggle, canEnterResults, canEnterMatches, canManageMatches, canDeleteTournament, onCloseTournament, onDeleteTournament, onAddResult, onEditMatch, onDeleteMatch }) {
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
                <MatchRow key={m.id} match={m} data={data} canManage={canManageMatches} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch} showDate={false} />
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
                <PlayerCombobox players={data.players} value={playerId} onChange={setPlayerId} />
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

          <div className="flex gap-2">
            {canEnterResults && t.status !== "da_ket_thuc" && (
              <button style={btnGhost} onClick={() => onCloseTournament(t.id)}>Đóng giải đấu</button>
            )}
            {canDeleteTournament && (
              <button
                style={{ ...btnGhost, color: C.bad, borderColor: C.bad + "55" }}
                onClick={async () => {
                  if (!window.confirm(
                    `Xóa vĩnh viễn giải "${t.name}"?\n\nToàn bộ trận đấu và điểm thưởng thành tích của giải này sẽ bị xóa, điểm của các VĐV liên quan sẽ được hoàn tác về đúng trước khi giải diễn ra. Hành động này không thể hoàn tác.`
                  )) return;
                  await onDeleteTournament(t.id);
                }}
              >
                Xóa giải đấu
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Enter match ---------- */
function EnterMatchTab({ data, onAddMatch }) {
  const openTournaments = data.tournaments.filter((t) => t.status !== "da_ket_thuc");
  const [kind, setKind] = useState("giao_huu");
  const [mode, setMode] = useState("don");
  const [matchStatus, setMatchStatus] = useState("completed");
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

  const isScheduled = matchStatus === "scheduled";
  const t = kind === "giai" ? data.tournaments.find((x) => x.id === Number(tournamentId)) : null;
  const effectiveType = kind === "giai" ? t?.type : "giao_huu";
  const pA = data.players.find((p) => p.id === Number(playerAId));
  const pB = data.players.find((p) => p.id === Number(playerBId));
  const pA2 = data.players.find((p) => p.id === Number(playerA2Id));
  const pB2 = data.players.find((p) => p.id === Number(playerB2Id));

  const preview = useMemo(() => {
    if (isScheduled) return null;
    if (!effectiveType || Number(setsA) === Number(setsB)) return null;
    if (mode === "doi") return null;
    if (!pA || !pB) return null;
    const winner = Number(setsA) > Number(setsB) ? "A" : "B";
    return computeMatchDeltaPreview(pA.rating, pB.rating, winner, effectiveType);
  }, [isScheduled, effectiveType, mode, pA, pB, setsA, setsB]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!isScheduled && Number(setsA) === Number(setsB)) return;
    if (kind === "giai" && !tournamentId) return;
    try {
      if (mode === "doi") {
        const ids = [playerAId, playerA2Id, playerBId, playerB2Id];
        if (ids.some((x) => !x) || new Set(ids).size !== 4) return;
        await onAddMatch({
          tournamentId: kind === "giai" ? Number(tournamentId) : null,
          friendlyDate: kind === "giao_huu" ? friendlyDate : undefined,
          mode: "doi",
          status: matchStatus,
          playerAId: Number(playerAId), playerA2Id: Number(playerA2Id),
          playerBId: Number(playerBId), playerB2Id: Number(playerB2Id),
          setsA: isScheduled ? null : Number(setsA), setsB: isScheduled ? null : Number(setsB),
        });
        setMsg(isScheduled
          ? `Đã tạo trận sắp diễn ra: ${pA.name} & ${pA2.name} vs ${pB.name} & ${pB2.name}`
          : `Đã lưu: ${pA.name} & ${pA2.name} ${setsA}–${setsB} ${pB.name} & ${pB2.name}`);
        setPlayerAId(""); setPlayerA2Id(""); setPlayerBId(""); setPlayerB2Id("");
      } else {
        if (!playerAId || !playerBId || playerAId === playerBId) return;
        await onAddMatch({
          tournamentId: kind === "giai" ? Number(tournamentId) : null,
          friendlyDate: kind === "giao_huu" ? friendlyDate : undefined,
          status: matchStatus,
          playerAId: Number(playerAId), playerBId: Number(playerBId),
          setsA: isScheduled ? null : Number(setsA), setsB: isScheduled ? null : Number(setsB),
        });
        setMsg(isScheduled
          ? `Đã tạo trận sắp diễn ra: ${pA.name} vs ${pB.name}`
          : `Đã lưu kết quả: ${pA.name} ${setsA}–${setsB} ${pB.name}`);
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

      <Field label="Trạng thái trận đấu">
        <div className="flex gap-4" style={{ fontSize: 14 }}>
          <label className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
            <input type="radio" name="matchStatus" checked={matchStatus === "completed"} onChange={() => setMatchStatus("completed")} />
            Kết thúc
          </label>
          <label className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
            <input type="radio" name="matchStatus" checked={matchStatus === "scheduled"} onChange={() => setMatchStatus("scheduled")} />
            Sắp diễn ra
          </label>
        </div>
      </Field>

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
            <PlayerCombobox players={data.players} value={playerAId} onChange={setPlayerAId} />
          </Field>
          {mode === "doi" && (
            <Field label="Đội A — VĐV 2">
              <PlayerCombobox players={data.players} value={playerA2Id} onChange={setPlayerA2Id} />
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Field label={mode === "doi" ? "Đội B — VĐV 1" : "VĐV B"}>
            <PlayerCombobox players={data.players} value={playerBId} onChange={setPlayerBId} />
          </Field>
          {mode === "doi" && (
            <Field label="Đội B — VĐV 2">
              <PlayerCombobox players={data.players} value={playerB2Id} onChange={setPlayerB2Id} />
            </Field>
          )}
        </div>
      </div>

      {isScheduled ? (
        <div style={{ fontSize: 13.5, color: C.muted, background: C.bg, borderRadius: 8, padding: "10px 12px" }}>
          Trận "Sắp diễn ra" chưa cần nhập tỷ số — sẽ hiện trong danh sách Giải đấu/Giao hữu, chưa tính điểm. Vào phần Sửa trận để nhập tỷ số khi trận đấu kết thúc.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label={mode === "doi" ? "Số ván thắng — Đội A" : "Số ván thắng — VĐV A"}><input type="number" min="0" style={inputStyle} value={setsA} onChange={(e) => setSetsA(e.target.value)} /></Field>
          <Field label={mode === "doi" ? "Số ván thắng — Đội B" : "Số ván thắng — VĐV B"}><input type="number" min="0" style={inputStyle} value={setsB} onChange={(e) => setSetsB(e.target.value)} /></Field>
        </div>
      )}

      {!isScheduled && (
        mode === "doi" ? (
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
        )
      )}

      {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}

      <div className="flex items-center gap-3">
        <button type="submit" style={btnPrimary} disabled={kind === "giai" && openTournaments.length === 0}>
          {isScheduled ? "Tạo trận sắp diễn ra" : "Lưu kết quả trận đấu"}
        </button>
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

/* ---------- Đăng nhập ---------- */
/* ---------- Popup chi tiết VĐV ---------- */
function PlayerDetailModal({ onClose, children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 50, padding: "5vh 16px", overflowY: "auto" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.bg, borderRadius: 16, width: "100%", maxWidth: 640, position: "relative" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 2, width: 32, height: 32, borderRadius: "50%",
            border: "none", background: C.surface, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", color: C.muted,
            fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ✕
        </button>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- Menu user góc trên bên phải ---------- */
function UserMenu({ currentUser, onLogout, onChangePassword }) {
  const [open, setOpen] = useState(false);
  const initials = (currentUser.username || "?")[0]?.toUpperCase() || "?";

  function stub(label) {
    setOpen(false);
    alert(`"${label}" sẽ được phát triển trong thời gian tới.`);
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        className="flex items-center gap-2.5"
        style={{ cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{currentUser.username}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>
            {ROLE_LABEL[currentUser.role] || currentUser.role}
          </div>
        </div>
        {currentUser.photo ? (
          <img
            src={currentUser.photo}
            alt={currentUser.username}
            style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `1.5px solid ${C.accent}40` }}
          />
        ) : (
          <div
            style={{
              width: 36, height: 36, borderRadius: "50%", background: C.accent + "1A", color: C.accent,
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14,
              fontFamily: FONT_DISPLAY, border: `1.5px solid ${C.accent}40`, flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}
      </div>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 39 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: "absolute", top: "100%", right: 0, marginTop: 8, background: C.surface,
              borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", overflow: "hidden", zIndex: 40, minWidth: 170,
            }}
          >
            <button onClick={() => stub("Hồ sơ")} style={menuBtnStyle}>Hồ sơ</button>
            <button onClick={() => { setOpen(false); onChangePassword(); }} style={menuBtnStyle}>Đổi mật khẩu</button>
            <div style={{ borderTop: `1px solid ${C.line}` }} />
            <button onClick={() => { setOpen(false); onLogout(); }} style={{ ...menuBtnStyle, color: C.bad }}>Đăng xuất</button>
          </div>
        </>
      )}
    </div>
  );
}
const menuBtnStyle = {
  display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent",
  border: "none", color: C.ink, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
};

/* ---------- Đổi mật khẩu ---------- */
function ChangePasswordModal({ onClose, onTokenUpdated }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu mới nhập lại không khớp.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPostJSON("/auth/change-password/", { old_password: oldPassword, new_password: newPassword });
      if (res?.token) onTokenUpdated(res.token);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.message || "Có lỗi khi đổi mật khẩu.");
    }
    setLoading(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 14, padding: 24, width: "100%", maxWidth: 360 }}
        className="flex flex-col gap-3"
      >
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: FONT_DISPLAY }}>Đổi mật khẩu</div>
        {success ? (
          <div style={{ color: "#1E8E52", fontSize: 13.5 }}>Đổi mật khẩu thành công!</div>
        ) : (
          <>
            <Field label="Mật khẩu hiện tại">
              <input type="password" style={inputStyle} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required autoFocus />
            </Field>
            <Field label="Mật khẩu mới">
              <input type="password" style={inputStyle} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </Field>
            <Field label="Nhập lại mật khẩu mới">
              <input type="password" style={inputStyle} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </Field>
            {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
            <div className="flex gap-2" style={{ marginTop: 4 }}>
              <button type="submit" style={btnPrimary} disabled={loading}>{loading ? "Đang lưu…" : "Đổi mật khẩu"}</button>
              <button type="button" style={btnGhost} onClick={onClose}>Huỷ</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function LoginModal({ onClose, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await onLogin(username, password);
      onClose();
    } catch (err) {
      setError(err.message || "Đăng nhập thất bại.");
    }
    setLoading(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 14, padding: 24, width: "100%", maxWidth: 360 }}
        className="flex flex-col gap-3"
      >
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: FONT_DISPLAY }}>Đăng nhập</div>
        <Field label="Tên đăng nhập">
          <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </Field>
        <Field label="Mật khẩu">
          <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button type="submit" style={btnPrimary} disabled={loading}>{loading ? "Đang đăng nhập…" : "Đăng nhập"}</button>
          <button type="button" style={btnGhost} onClick={onClose}>Huỷ</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Quản lý User ---------- */
const ROLE_OPTIONS = [
  { id: "admin", label: "Quản trị viên" },
  { id: "manager", label: "Quản lý giải đấu" },
  { id: "scorer", label: "Người nhập liệu" },
  { id: "user", label: "Người dùng" },
];

function UsersTab({ onCreateUser, onUpdateRole, onResetPassword }) {
  const [users, setUsers] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const list = await apiGet("/users/");
      setUsers(list);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message || "Không tải được danh sách user.");
    }
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSaving(true); setError("");
    try {
      await onCreateUser({ username: username.trim(), password, newRole });
      setUsername(""); setPassword(""); setNewRole("user"); setOpen(false);
      await load();
    } catch (err) {
      setError(err.message || "Có lỗi khi tạo user.");
    }
    setSaving(false);
  }

  async function changeRole(userId, role) {
    try {
      await onUpdateRole(userId, role);
      await load();
    } catch (err) {
      alert(err.message || "Có lỗi khi đổi vai trò.");
    }
  }

  async function resetPassword(userId, uname) {
    const pw = window.prompt(`Đặt mật khẩu mới cho "${uname}":`);
    if (!pw) return;
    try {
      await onResetPassword(userId, pw);
      alert("Đã đổi mật khẩu.");
    } catch (err) {
      alert(err.message || "Có lỗi khi đổi mật khẩu.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {!open ? (
          <button style={btnPrimary} onClick={() => setOpen(true)}>+ Thêm user</button>
        ) : (
          <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }} className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tên đăng nhập">
                <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} required />
              </Field>
              <Field label="Mật khẩu">
                <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <Field label="Vai trò">
                <select style={inputStyle} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </Field>
            </div>
            {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
            <div className="flex gap-2">
              <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Đang lưu…" : "Lưu user"}</button>
              <button type="button" style={btnGhost} onClick={() => setOpen(false)}>Huỷ</button>
            </div>
          </form>
        )}
      </div>

      {loadErr && <EmptyState text={loadErr} />}

      {users === null ? null : users.length === 0 ? (
        <EmptyState text="Chưa có user nào." />
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          {users.map((u, i) => (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: i < users.length - 1 ? `1px solid ${C.line}` : "none", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{u.username}</div>
                {u.email && <div style={{ fontSize: 12, color: C.muted }}>{u.email}</div>}
              </div>
              <div className="flex items-center gap-2">
                <select style={{ ...inputStyle, padding: "6px 10px", fontSize: 13 }} value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                  {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <button style={{ ...btnGhost, padding: "6px 12px", fontSize: 12.5 }} onClick={() => resetPassword(u.id, u.username)}>Đổi mật khẩu</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
