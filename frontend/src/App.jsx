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
const HANDICAP_FORMAT_RE = /^\d{1,2}(-\d{1,2}){0,3}$/;
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

/* ---------- Điểm chấp đề xuất: tra bảng quy tắc (ranking/Điểm chấp) theo chênh lệch điểm ----------
   Trả về chuỗi điểm chấp (vd "0-2-0", "" = không chấp) nếu tìm thấy quy tắc khớp, hoặc null nếu
   chênh lệch này chưa được cấu hình quy tắc nào. */
function findHandicapSuggestion(rules, diff) {
  if (diff === null || diff === undefined) return null;
  const match = (rules || []).find((r) => diff >= r.min_diff && (r.max_diff === null || r.max_diff === undefined || diff <= r.max_diff));
  return match ? (match.handicap_text || "") : null;
}

/* ---------- Khối nhập điểm chấp dùng chung cho 3 form nhập trận (FriendlyMatchEntryForm/TournamentMatchForm/
   SlotFillModal): khi giải "Có chấp điểm" (hoặc Giao hữu) và thể thức Đánh đơn, hiện check "Điểm chấp
   đề xuất" — tick vào thì tự tính chênh lệch rating 2 bên, tra quy tắc để điền sẵn (bên yếu hơn được
   chấp), khóa không cho tự sửa; bỏ check thì quay lại tự nhập như cũ. */
function HandicapFields({ tournamentType, mode, pA, pB, handicapA, handicapB, setHandicapA, setHandicapB, rules }) {
  const [useSuggestion, setUseSuggestion] = useState(false);
  const canSuggest = (tournamentType === "co_chap" || tournamentType === "giao_huu") && mode !== "doi";

  useEffect(() => {
    if (!canSuggest && useSuggestion) setUseSuggestion(false);
  }, [canSuggest]);

  useEffect(() => {
    if (!useSuggestion || !canSuggest) return;
    if (!pA || !pB) return;
    const diff = Math.abs(pA.rating - pB.rating);
    const suggestion = findHandicapSuggestion(rules, diff);
    if (suggestion === null) { setHandicapA(""); setHandicapB(""); return; }
    if (pA.rating <= pB.rating) { setHandicapA(suggestion); setHandicapB(""); }
    else { setHandicapA(""); setHandicapB(suggestion); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSuggestion, canSuggest, pA?.rating, pB?.rating, rules]);

  const diffNow = canSuggest && pA && pB ? Math.abs(pA.rating - pB.rating) : null;
  const suggestionNow = diffNow !== null ? findHandicapSuggestion(rules, diffNow) : null;

  return (
    <>
      {canSuggest && (
        <label className="flex items-center gap-2" style={{ fontSize: 13.5, cursor: "pointer" }}>
          <input type="checkbox" checked={useSuggestion} onChange={(e) => setUseSuggestion(e.target.checked)} />
          Điểm chấp đề xuất (tự tính theo chênh lệch điểm 2 bên)
        </label>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label={`Điểm chấp — ${mode === "doi" ? "Đội A" : "VĐV A"} (nếu có)`}>
          <input style={inputStyle} placeholder="VD: 2-0-2" value={handicapA} disabled={useSuggestion} onChange={(e) => setHandicapA(e.target.value)} />
        </Field>
        <Field label={`Điểm chấp — ${mode === "doi" ? "Đội B" : "VĐV B"} (nếu có)`}>
          <input style={inputStyle} placeholder="VD: 2-0-2" value={handicapB} disabled={useSuggestion} onChange={(e) => setHandicapB(e.target.value)} />
        </Field>
      </div>
      {canSuggest && useSuggestion && pA && pB && (
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: -10 }}>
          {suggestionNow === null
            ? `Chênh lệch ${diffNow} điểm — chưa có quy tắc nào khớp (xem Quản lý điểm → Điểm chấp), hãy bỏ check để tự nhập.`
            : `Chênh lệch ${diffNow} điểm → ${suggestionNow ? `đề xuất chấp ${suggestionNow}` : "không chấp"}.`}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: -10 }}>
        Chỉ nhập cho bên được chấp điểm, để trống nếu không chấp. Điểm chấp chỉ mang tính ghi chú hiển thị, không ảnh hưởng cách tính điểm.
      </div>
    </>
  );
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

/* Hiển thị khoảng ngày diễn ra của giải đấu: 1 ngày nếu date_to trống/giống date, ngược lại "từ – đến". */
function tournamentDateRangeText(t) {
  if (!t?.date) return "";
  if (!t.date_to || t.date_to === t.date) return fmtDate(t.date);
  return `${fmtDate(t.date)} – ${fmtDate(t.date_to)}`;
}

// Trạng thái giải đấu luôn do SERVER tính tự động từ Từ ngày/Đến ngày so với hôm nay
// (xem Tournament.computed_status ở backend) — FE chỉ hiển thị, không tự suy luận lại ngày giờ
// ở client để tránh lệch múi giờ/giờ hệ thống máy người dùng.
const TOURNAMENT_STATUS_META = {
  sap_dien_ra: { label: "Sắp diễn ra", color: "#B8860B" },
  dang_dien_ra: { label: "Đang diễn ra", color: "#1E8E52" },
  da_ket_thuc: { label: "Đã kết thúc", color: C.muted },
};
function tournamentStatusMeta(t) {
  return TOURNAMENT_STATUS_META[t?.status] || TOURNAMENT_STATUS_META.dang_dien_ra;
}

// Nhãn hiển thị ở giữa MatchTeamsGrid cho các trận CHƯA có tỷ số (status !== "completed") — "scheduled"
// giữ nguyên như cũ, 3 trạng thái còn lại chỉ phát sinh từ luồng VĐV tự đăng ký Giao hữu (xem Phase 3).
const MATCH_PENDING_LABEL = {
  scheduled: "(sắp diễn ra)",
  cho_xac_nhan: "(chờ xác nhận)",
  tu_choi: "(đã từ chối)",
  het_han: "(đã hết hạn)",
};

/* Bỏ dấu tiếng Việt + chữ thường, dùng để tìm kiếm gần đúng không phân biệt dấu/hoa-thường */
const MAX_PHOTO_SIZE = 1024 * 1024; // 1MB — khớp với giới hạn ở backend

// ⚠️ THAY bằng SITE KEY thật của bạn (site key là công khai, an toàn để đặt trực tiếp ở đây).
// Site key phải khớp với domain đã đăng ký trên Google reCAPTCHA (clbsaomaiag.com).
const RECAPTCHA_SITE_KEY = "YOUR_RECAPTCHA_V3_SITE_KEY";

/* Chạy reCAPTCHA v3 ngầm (không hiện gì cho người dùng), trả về token hoặc null nếu lỗi/chưa cấu hình */
function getRecaptchaToken(action = "login") {
  return new Promise((resolve) => {
    if (!RECAPTCHA_SITE_KEY || RECAPTCHA_SITE_KEY === "YOUR_RECAPTCHA_V3_SITE_KEY") {
      console.warn("[reCAPTCHA] Chưa cấu hình RECAPTCHA_SITE_KEY trong App.jsx.");
      resolve(null);
      return;
    }
    if (!window.grecaptcha) {
      console.warn("[reCAPTCHA] window.grecaptcha chưa tồn tại — script chưa tải được. Kiểm tra script trong index.html.");
      resolve(null);
      return;
    }
    window.grecaptcha.ready(() => {
      window.grecaptcha
        .execute(RECAPTCHA_SITE_KEY, { action })
        .then((token) => {
          console.log("[reCAPTCHA] Lấy token thành công, độ dài:", token?.length);
          resolve(token);
        })
        .catch((err) => {
          console.error("[reCAPTCHA] execute() lỗi:", err);
          resolve(null);
        });
    });
  });
}

/* Tính theo từng VĐV: tổng điểm từ trận đấu (match) và tổng điểm thưởng thành tích (result) — dựa trên PointHistory */
function computeDeltaMap(history) {
  const map = {};
  for (const h of history || []) {
    if (!map[h.player]) map[h.player] = { matchDelta: 0, achievementBonus: 0 };
    if (h.match) map[h.player].matchDelta += h.delta;
    else if (h.result) map[h.player].achievementBonus += h.delta;
  }
  return map;
}

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
function errMessage(err, fallback) {
  if (err && err.detail) return err.detail;
  if (Array.isArray(err)) return err.join(" ");
  if (err && typeof err === "object") {
    const parts = Object.values(err).flatMap((v) => (Array.isArray(v) ? v : [String(v)]));
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

async function apiPostJSON(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(errMessage(err, `POST ${path} thất bại`));
    Object.assign(e, err); // giữ lại các trường phụ (vd captcha_required, captcha_question)
    throw e;
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
    throw new Error(errMessage(err, `PATCH ${path} thất bại`));
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
// POST không cần đọc lại JSON trả về (action trả 204, VD xóa sơ đồ đấu) — vẫn đọc lỗi JSON nếu có.
async function apiPostNoContent(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(errMessage(err, `POST ${path} thất bại`));
  }
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

function ScorePill({ value, style, matchDelta, achievementBonus }) {
  return (
    <span className="flex items-center" style={{ gap: 4, display: "inline-flex" }}>
      <span className="tabular" style={{ background: C.pillScoreBg, color: C.pillScoreText, fontWeight: 700, fontSize: 13.5, padding: "4px 12px", borderRadius: 999, ...style }}>
        {value}
      </span>
      {!!matchDelta && (
        <span className="tabular" style={{ color: matchDelta > 0 ? C.pillUpText : C.pillDownText, fontWeight: 700, fontSize: 12 }}>
          ({matchDelta > 0 ? "+" : ""}{matchDelta})
        </span>
      )}
      {!!achievementBonus && achievementBonus > 0 && (
        <span className="tabular" style={{ color: "#FF9900", fontWeight: 700, fontSize: 12 }}>
          (+{achievementBonus})
        </span>
      )}
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

function HandicapTag({ value }) {
  if (!value) return null;
  return (
    <span style={{ color: "#1E8E52", fontWeight: 800, fontSize: "0.92em", marginLeft: 5, whiteSpace: "nowrap" }}>
      +{value}
    </span>
  );
}

function MatchTeamsGrid({ leftP1, leftP2, rightP1, rightP2, middle, leftHandicap, rightHandicap }) {
  const hasSecondRow = !!(leftP2 || rightP2);
  const nameStyle = { textAlign: "left", color: C.nameColor, fontWeight: 700, overflowWrap: "anywhere" };
  return (
    <div className="tt-teams-grid" style={{ display: "grid", gridTemplateColumns: "minmax(120px,1fr) 78px minmax(120px,1fr)", width: "100%", alignItems: "center", rowGap: 1, columnGap: 10 }}>
      <div className="tt-tg-1" style={nameStyle}>{leftP1?.name}<HandicapTag value={leftHandicap} /></div>
      <div
        className="tt-tg-mid tabular"
        style={{
          gridRow: hasSecondRow ? "span 2" : "auto", alignSelf: "center",
          textAlign: "center", fontSize: 13, fontWeight: 800, color: C.ink, whiteSpace: "nowrap",
        }}
      >
        {middle}
      </div>
      <div className="tt-tg-2" style={nameStyle}>{rightP1?.name}<HandicapTag value={rightHandicap} /></div>
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
  if (name === "settings") return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3.8a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.4 2.9a7.6 7.6 0 0 0-1.7 1l-2.3-.8-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-.8a7.6 7.6 0 0 0 1.7 1L9 21h6l.4-2.9a7.6 7.6 0 0 0 1.7-1l2.3.8 2-3.4-2-1.5Z" /></svg>;
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
  const [groups, setGroups] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [knockoutSlots, setKnockoutSlots] = useState([]);
  const [handicapRules, setHandicapRules] = useState([]);
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
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Trận Giao hữu đang "Chờ xác nhận" mà currentUser (qua VĐV liên kết) chính là đối thủ cần xác nhận
  // (player_b) — và chưa quá ngày diễn ra (quá hạn thì BE đã tự chuyển "Hết hạn", không còn ở đây nữa).
  const [dismissedPendingIds, setDismissedPendingIds] = useState([]); // id trận đã bấm Hủy ở popup thông báo (phiên này)
  const [noticeMatchId, setNoticeMatchId] = useState(null); // id trận đang hiện popup thông báo "có trận chờ xác nhận"
  const [confirmMatchId, setConfirmMatchId] = useState(null); // id trận đang mở form Xác nhận/Từ chối

  const role = currentUser?.role || "public";

  const pendingConfirmForMe = useMemo(() => {
    if (!currentUser?.player_id) return [];
    const today = todayStr();
    return matches.filter((m) => m.status === "cho_xac_nhan" && m.player_b === currentUser.player_id && m.date >= today);
  }, [matches, currentUser]);

  useEffect(() => {
    if (!loaded || noticeMatchId || confirmMatchId) return;
    const toNotify = pendingConfirmForMe.find((m) => !dismissedPendingIds.includes(m.id));
    if (toNotify) setNoticeMatchId(toNotify.id);
  }, [pendingConfirmForMe, dismissedPendingIds, loaded, noticeMatchId, confirmMatchId]);
  // Dọn lại nếu trận đang mở popup bỗng biến mất khỏi danh sách (VD: bị xác nhận/từ chối/xóa ở nơi
  // khác, hoặc vừa quá hạn và bị BE tự chuyển "Hết hạn") — tránh giữ popup trỏ vào dữ liệu đã cũ.
  useEffect(() => {
    if (noticeMatchId && !matches.some((m) => m.id === noticeMatchId)) setNoticeMatchId(null);
  }, [matches, noticeMatchId]);
  useEffect(() => {
    if (confirmMatchId && !matches.some((m) => m.id === confirmMatchId)) setConfirmMatchId(null);
  }, [matches, confirmMatchId]);

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

  async function login(username, password, recaptchaToken) {
    const res = await apiPostJSON("/auth/login/", { username, password, recaptcha_token: recaptchaToken });
    localStorage.setItem("tt_token", res.token);
    setToken(res.token);
    setCurrentUser({ id: res.id, username: res.username, role: res.role, player_id: res.player_id, photo: res.photo });
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
      const [p, t, m, r, h, g, ks, hr] = await Promise.all([
        apiGet("/players/"), apiGet("/tournaments/"), apiGet("/matches/"),
        apiGet("/results/"), apiGet("/history/"), apiGet("/groups/"), apiGet("/knockout-slots/"),
        apiGet("/handicap-rules/"),
      ]);
      setPlayers(p); setTournaments(t); setMatches(m); setResults(r); setHistory(h); setGroups(g); setKnockoutSlots(ks);
      setHandicapRules(hr);
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

  async function addTournament({ name, type, date, dateTo }) {
    const created = await apiPostJSON("/tournaments/", { name, type, date, date_to: dateTo || date });
    await refreshAll();
    return created;
  }
  async function addGroup({ tournamentId, name, playerIds }) {
    await apiPostJSON("/groups/", { tournament: tournamentId, name, players: playerIds || [] });
    await refreshAll();
  }
  async function updateGroup(groupId, patch) {
    await apiPatchJSON(`/groups/${groupId}/`, patch);
    await refreshAll();
  }
  async function deleteGroup(groupId) {
    await apiDelete(`/groups/${groupId}/`);
    await refreshAll();
  }
  async function editTournament(tid, { name, type, date, dateTo }) {
    // Trạng thái giải đấu luôn TỰ TÍNH từ Từ ngày/Đến ngày (xem Tournament.computed_status ở
    // backend) — không còn nút đóng giải thủ công nữa; Quản trị viên chỉnh ngày diễn ra ở đây thì
    // trạng thái Sắp/Đang diễn ra/Đã kết thúc tự khớp theo logic đó.
    await apiPatchJSON(`/tournaments/${tid}/`, { name, type, date, date_to: dateTo || date });
    await refreshAll();
  }

  async function setTournamentRegistration(tid, registrationStatus) {
    await apiPatchJSON(`/tournaments/${tid}/`, { registration_status: registrationStatus });
    await refreshAll();
  }

  async function deleteTournament(tid) {
    await apiDelete(`/tournaments/${tid}/`);
    await refreshAll();
  }

  async function generateBracket(tid, firstRoundMatches) {
    await apiPostJSON(`/tournaments/${tid}/generate_bracket/`, { first_round_matches: firstRoundMatches });
    await refreshAll();
  }
  async function deleteBracket(tid) {
    await apiPostNoContent(`/tournaments/${tid}/delete_bracket/`);
    await refreshAll();
  }
  async function renameKnockoutRound(tid, roundNo, name) {
    await apiPatchJSON(`/tournaments/${tid}/rename_knockout_round/`, { round_no: roundNo, name });
    await refreshAll();
  }
  async function setSlotBye(slotId, { mode, playerId, player2Id }) {
    await apiPostJSON(`/knockout-slots/${slotId}/set_bye/`, { mode, player: playerId, player2: player2Id || null });
    await refreshAll();
  }
  async function setSlotMatch(slotId, { mode, status, playerAId, playerBId, playerA2Id, playerB2Id, setsA, setsB, handicapA, handicapB }) {
    await apiPostJSON(`/knockout-slots/${slotId}/set_match/`, {
      mode, status: status || "completed",
      player_a: playerAId, player_b: playerBId,
      player_a2: playerA2Id || null, player_b2: playerB2Id || null,
      sets_a: setsA ?? null, sets_b: setsB ?? null,
      handicap_a: (handicapA || "").trim(), handicap_b: (handicapB || "").trim(),
    });
    await refreshAll();
  }
  async function clearSlot(slotId) {
    await apiPostJSON(`/knockout-slots/${slotId}/clear/`, {});
    await refreshAll();
  }

  async function addMatch({ tournamentId, mode, status, playerAId, playerBId, playerA2Id, playerB2Id, setsA, setsB, friendlyDate, stage, groupId, handicapA, handicapB }) {
    await apiPostJSON("/matches/", {
      tournament: tournamentId || null,
      mode: mode || "don",
      status: status || "completed",
      stage: stage || "", group: groupId || null,
      player_a: playerAId, player_b: playerBId,
      player_a2: playerA2Id || null, player_b2: playerB2Id || null,
      sets_a: setsA ?? null, sets_b: setsB ?? null,
      handicap_a: (handicapA || "").trim(), handicap_b: (handicapB || "").trim(),
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

  async function addResult({ tournamentId, contentType, playerId, teammateIds, placement, saveOnly }) {
    await apiPostJSON("/results/", {
      tournament: tournamentId, content_type: contentType, player: playerId,
      teammates: teammateIds || [], placement, save_only: !!saveOnly,
    });
    await refreshAll();
  }
  async function editResult(resultId, { contentType, playerId, teammateIds, placement, saveOnly }) {
    await apiPatchJSON(`/results/${resultId}/`, {
      content_type: contentType, player: playerId, teammates: teammateIds || [],
      placement, save_only: !!saveOnly,
    });
    await refreshAll();
  }
  async function deleteResult(resultId) {
    await apiDelete(`/results/${resultId}/`);
    await refreshAll();
  }

  async function createUser({ username, password, newRole, playerId }) {
    return apiPostJSON("/users/", { username, password, new_role: newRole, player: playerId || null });
  }
  async function updateUserRole(userId, newRole) {
    return apiPatchJSON(`/users/${userId}/`, { new_role: newRole });
  }
  async function resetUserPassword(userId, password) {
    return apiPatchJSON(`/users/${userId}/`, { password });
  }
  async function deleteUser(userId) {
    await apiDelete(`/users/${userId}/`);
  }

  async function fetchRankingConfig() {
    return apiGet("/ranking-config/");
  }
  async function saveRankingConfig(patch) {
    return apiPatchJSON("/ranking-config/", patch);
  }

  async function addHandicapRule({ minDiff, maxDiff, handicapText }) {
    await apiPostJSON("/handicap-rules/", { min_diff: minDiff, max_diff: maxDiff ?? null, handicap_text: handicapText || "" });
    await refreshAll();
  }
  async function editHandicapRule(ruleId, { minDiff, maxDiff, handicapText }) {
    await apiPatchJSON(`/handicap-rules/${ruleId}/`, { min_diff: minDiff, max_diff: maxDiff ?? null, handicap_text: handicapText || "" });
    await refreshAll();
  }
  async function deleteHandicapRule(ruleId) {
    await apiDelete(`/handicap-rules/${ruleId}/`);
    await refreshAll();
  }

  // Danh sách chờ đăng ký thi đấu — KHÔNG nằm trong refreshAll()/data chung: ai cũng xem được (kể cả
  // chưa đăng nhập), chỉ thêm/sửa/xóa mới cần quyền Admin/Quản lý giải; popup tự tải riêng theo từng giải.
  async function fetchWaitlist(tournamentId) {
    return apiGet(`/tournament-waitlist/?tournament=${tournamentId}`);
  }
  async function addWaitlistEntry(tournamentId, playerId) {
    return apiPostJSON("/tournament-waitlist/", { tournament: tournamentId, player: playerId });
  }
  async function updateWaitlistEntry(entryId, patch) {
    return apiPatchJSON(`/tournament-waitlist/${entryId}/`, patch);
  }
  async function deleteWaitlistEntry(entryId) {
    return apiDelete(`/tournament-waitlist/${entryId}/`);
  }

  // Đăng ký Giao hữu (VĐV tự đăng ký) — tạo trận ở trạng thái "Chờ xác nhận"; xác nhận/từ chối chỉ
  // dành cho đúng VĐV được mời (player_b). Cả 3 hàm đều refreshAll() để cập nhật danh sách Giao hữu.
  async function selfRegisterFriendlyMatch(payload) {
    const match = await apiPostJSON("/matches/self-register/", payload);
    await refreshAll();
    return match;
  }
  async function confirmFriendlyMatch(matchId) {
    const match = await apiPostJSON(`/matches/${matchId}/confirm/`, {});
    await refreshAll();
    return match;
  }
  async function rejectFriendlyMatch(matchId) {
    const match = await apiPostJSON(`/matches/${matchId}/reject/`, {});
    await refreshAll();
    return match;
  }

  async function changeMyPhoto(photoFile) {
    const fd = new FormData();
    fd.append("photo", photoFile);
    await apiForm("/auth/my-photo/", "PATCH", fd);
    await refreshAll();
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
    { id: "users", label: "Quản lý User", icon: "users", show: role === "admin" },
    { id: "ranking-config", label: "Quản lý điểm", icon: "settings", show: role === "admin" },
  ].filter((t) => t.show);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.id === tab)) setTab("leaderboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const data = { players, tournaments, matches, results, history, groups, knockoutSlots, handicapRules };

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
        .grecaptcha-badge { visibility: hidden; }
        .tt-groups-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; align-items: start; }
        .tt-bracket { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 6px; }
        .tt-bracket-col { display: flex; flex-direction: column; justify-content: space-around; gap: 18px; min-width: 240px; flex: 1; }
        @media (max-width: 720px) {
          .tt-bracket { flex-direction: column; overflow-x: visible; gap: 18px; }
          .tt-bracket-col { min-width: 0; }
        }
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
          .tt-lb-th, .tt-lb-td { padding: 8px 8px !important; font-size: 12.5px !important; }
        }
        /* Thẻ trận đấu cần xếp dọc (mobile layout) khi KHUNG CHỨA của nó hẹp — không phải khi màn
           hình hẹp. Ví dụ: 3 thẻ Bảng đấu nằm cạnh nhau trên màn hình desktop rộng vẫn rất hẹp mỗi
           thẻ, nên @media (theo viewport) không bắt được — @container (theo độ rộng khung chứa thật
           sự) mới xử lý triệt để. .tt-matchlist đánh dấu khung chứa danh sách trận đấu (bọc quanh
           các MatchRow); khi khung đó hẹp dưới 480px, các trận bên trong tự xếp dọc dù màn hình to. */
        .tt-matchlist { container-type: inline-size; }
        @container (max-width: 480px) {
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
        .tt-group-toggle { transition: background 120ms ease, border-color 120ms ease; }
        .tt-group-toggle:hover:not(:disabled) { background: ${C.ink}0F !important; }
        .tt-group-toggle:disabled { cursor: default; }
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
          .tt-footer { left: 62px !important; font-size: 10px !important; }
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

        <div className="tt-sidebar-nav flex flex-col gap-1" style={{ padding: "8px 12px" }}>
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

        {!currentUser && (
          <div style={{ padding: "6px 12px 14px" }}>
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
          </div>
        )}
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
            results={results}
            allPlayers={players}
            canManage={canManagePlayers}
            canManageMatches={canManageMatches}
            canEnterMatches={canEnterMatches}
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
            <UserMenu
              currentUser={currentUser} onLogout={logout} onChangePassword={() => setShowChangePassword(true)}
              onOpenProfile={() => setTab("profile")} onOpenRegister={() => setShowRegisterModal(true)}
            />
          </div>
        )}

        {showRegisterModal && currentUser && (
          <SelfRegisterModal
            currentUser={currentUser} tournaments={tournaments} players={players} handicapRules={handicapRules}
            onFetchWaitlist={fetchWaitlist} onAddWaitlistEntry={addWaitlistEntry}
            onSelfRegisterMatch={selfRegisterFriendlyMatch}
            onClose={() => setShowRegisterModal(false)}
          />
        )}

        {noticeMatchId && !confirmMatchId && (() => {
          const m = matches.find((x) => x.id === noticeMatchId);
          if (!m) return null;
          const opponent = players.find((p) => p.id === m.player_a);
          return (
            <FriendlyPendingNoticeModal
              opponentName={opponent?.name || "Một VĐV"}
              onConfirmOpen={() => { setConfirmMatchId(noticeMatchId); setNoticeMatchId(null); }}
              onDismiss={() => { setDismissedPendingIds((prev) => [...prev, noticeMatchId]); setNoticeMatchId(null); }}
            />
          );
        })()}

        {confirmMatchId && (() => {
          const m = matches.find((x) => x.id === confirmMatchId);
          if (!m) return null;
          return (
            <FriendlyConfirmModal
              match={m} players={players}
              onConfirm={async () => { await confirmFriendlyMatch(m.id); setConfirmMatchId(null); }}
              onReject={async () => { await rejectFriendlyMatch(m.id); setConfirmMatchId(null); }}
              onClose={() => setConfirmMatchId(null)}
            />
          );
        })()}
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 64px" }}>
          {loadError && (
            <div style={{ background: "#FBEAE7", color: C.bad, border: `1px solid ${C.bad}33`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13.5 }}>
              {loadError}
            </div>
          )}

          {tab === "leaderboard" && (
            <Leaderboard players={players} matches={matches} history={history} onSelect={setSelectedPlayer} />
          )}

          {tab === "players" && (
            <PlayersTab players={players} history={history} canManage={canManagePlayers} onAdd={addPlayer} onSelect={setSelectedPlayer} />
          )}

          {tab === "tournaments" && (
            <TournamentsTab
              data={data} canCreate={canManageTournaments} canEnterResults={canEnterResults} canEnterMatches={canEnterMatches} canManageMatches={canManageMatches}
              canDeleteTournament={role === "admin"}
              onAddTournament={addTournament} onEditTournament={editTournament} onDeleteTournament={deleteTournament} onAddResult={addResult}
              onEditResult={editResult} onDeleteResult={deleteResult}
              onAddMatch={addMatch} onEditMatch={editMatch} onDeleteMatch={deleteMatch}
              onAddGroup={addGroup} onUpdateGroup={updateGroup} onDeleteGroup={deleteGroup}
              onGenerateBracket={generateBracket} onDeleteBracket={deleteBracket} onRenameKnockoutRound={renameKnockoutRound}
              onSetSlotBye={setSlotBye} onSetSlotMatch={setSlotMatch} onClearSlot={clearSlot}
              onSetTournamentRegistration={setTournamentRegistration}
              onFetchWaitlist={fetchWaitlist} onAddWaitlistEntry={addWaitlistEntry}
              onUpdateWaitlistEntry={updateWaitlistEntry} onDeleteWaitlistEntry={deleteWaitlistEntry}
            />
          )}

          {tab === "friendly" && (
            <FriendlyMatchesTab
              data={data} canManage={canManageMatches} canAddMedia={canEnterMatches}
              canAddMatch={canEnterMatches} onAddMatch={addMatch}
              onEditMatch={editMatch} onDeleteMatch={deleteMatch}
              currentUser={currentUser} onConfirmMatch={confirmFriendlyMatch} onRejectMatch={rejectFriendlyMatch}
            />
          )}

          {tab === "users" && role === "admin" && (
            <UsersTab players={players} onCreateUser={createUser} onUpdateRole={updateUserRole} onResetPassword={resetUserPassword} onDeleteUser={deleteUser} />
          )}

          {tab === "ranking-config" && role === "admin" && (
            <RankingConfigTab
              onFetch={fetchRankingConfig} onSave={saveRankingConfig}
              handicapRules={handicapRules}
              onAddHandicapRule={addHandicapRule} onEditHandicapRule={editHandicapRule} onDeleteHandicapRule={deleteHandicapRule}
            />
          )}

          {tab === "profile" && currentUser && (
            <ProfileTab
              currentUser={currentUser}
              players={players}
              matches={matches}
              tournaments={tournaments}
              results={results}
              history={history}
              onChangePassword={() => setShowChangePassword(true)}
              onChangeMyPhoto={changeMyPhoto}
            />
          )}
        </div>
      </div>

      <div
        className="tt-footer"
        style={{
          position: "fixed", left: 232, right: 0, bottom: 0, height: 40, zIndex: 40,
          background: C.ink, display: "flex", alignItems: "center",
          padding: "0 16px 0 24px", fontSize: 11.5, color: "#AEB4C9",
        }}
      >
        <span>© 2026 — CLB BÓNG BÀN SAO MAI - AN GIANG. Liên hệ: Trần Tuyên: 0907 303009</span>
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
  const deltaMap = useMemo(() => computeDeltaMap(history), [history]);

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
          <div className="tt-lb-scroll" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr style={{ background: C.ink }}>
                {cols.map((c) => (
                  <th key={c.label} className="tt-lb-th" style={{ textAlign: c.align, padding: "13px 16px", fontSize: 11.5, color: "#AEB4C9", fontWeight: 700, fontStyle: "italic", letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" }}>
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
                    <td className="tt-lb-td tabular" style={{ padding: "12px 16px", textAlign: "left", fontStyle: "italic", fontWeight: 800, color: C.muted }}>#{rankNum}</td>
                    <td className="tt-lb-td" style={{ padding: "12px 16px", textAlign: "left" }}>
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
                    <td className="tt-lb-td" style={{ padding: "12px 16px", textAlign: "center" }}>
                      <ScorePill value={p.rating} matchDelta={deltaMap[p.id]?.matchDelta} achievementBonus={deltaMap[p.id]?.achievementBonus} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
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

function PlayersTab({ players, history, canManage, onAdd, onSelect }) {
  const deltaMap = useMemo(() => computeDeltaMap(history), [history]);
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
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

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
    if (file && file.size > MAX_PHOTO_SIZE) {
      setError("Ảnh vượt quá 1MB, vui lòng chọn ảnh nhỏ hơn.");
      e.target.value = "";
      return;
    }
    setError("");
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

      <SearchBox value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Tìm vận động viên theo tên…" />

      {filteredPlayers.length === 0 ? (
        <EmptyState text={players.length === 0 ? "Chưa có vận động viên nào." : "Không tìm thấy vận động viên nào khớp."} />
      ) : (
        (() => {
          const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
          const validPage = Math.min(page, totalPages);
          const paged = filteredPlayers.slice((validPage - 1) * PAGE_SIZE, validPage * PAGE_SIZE);
          return (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14 }}>
              {paged.map((p, i) => (
                <div key={p.id} data-row onClick={() => onSelect(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: i < paged.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" }}>
                  <div className="flex items-center gap-3">
                    <Avatar player={p} size={38} />
                    <div>
                      <div style={{ fontWeight: 600 }}><NameWithNickname name={p.name} nickname={p.nickname} /></div>
                      <div style={{ fontSize: 12.5, color: C.muted }}>Tham gia {fmtDate(p.join_date)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <HangBadge hang={p.hang} />
                    <ScorePill value={p.rating} matchDelta={deltaMap[p.id]?.matchDelta} achievementBonus={deltaMap[p.id]?.achievementBonus} />
                  </div>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${C.line}` }}>
                <Pagination page={validPage} totalPages={totalPages} onChange={setPage} />
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

/* ---------- Dòng Thành tích (dùng chung cho tab Thành tích ở PlayerDetail và Hồ sơ) ---------- */
function AchievementRow({ result: r, tournament, otherNames, isLast }) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 16px",
        borderBottom: isLast ? "none" : `1px solid ${C.line}`, gap: 10,
      }}
    >
      <div>
        <div className="flex items-baseline gap-2">
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>
            {CONTENT_LABEL[r.content_type]}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink, fontFamily: FONT_DISPLAY }}>{BONUS_LABEL[r.placement]}</span>
        </div>
        <div className="flex items-baseline gap-2" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.nameColor }}>{tournament?.name || "Giải đấu"}</span>
          {tournament?.date && <span style={{ fontSize: 12, color: C.muted }}>{tournamentDateRangeText(tournament)}</span>}
        </div>
        {otherNames.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: C.muted }}>Đồng đội</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.nameColor }}>{otherNames.join(", ")}</div>
          </div>
        )}
      </div>
      {r.bonus_applied ? (
        <span className="tabular" style={{ color: "#1E8E52", fontWeight: 700, fontSize: 12.5, flexShrink: 0 }}>+{r.bonus}</span>
      ) : (
        <span style={{ color: C.muted, fontSize: 12, flexShrink: 0 }}>Không cộng điểm</span>
      )}
    </div>
  );
}

function PlayerDetail({ player, history, matches, tournaments, results, allPlayers, canManage, canManageMatches, canEnterMatches, onEdit, onDeletePlayer, onEditMatch, onDeleteMatch, onBack }) {
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
  const [detailTab, setDetailTab] = useState("history");
  const myResults = (results || []).filter((r) => r.player === player.id || (r.teammates || []).includes(player.id));
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);

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
    if (file && file.size > MAX_PHOTO_SIZE) {
      setError("Ảnh vượt quá 1MB, vui lòng chọn ảnh nhỏ hơn.");
      e.target.value = "";
      return;
    }
    setError("");
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
                <div
                  onClick={() => { if (photoUrl(player)) setShowPhotoLightbox(true); }}
                  style={{ cursor: photoUrl(player) ? "pointer" : "default" }}
                >
                  <Avatar player={player} size={52} />
                </div>
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
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}` }} className="flex gap-2">
          <button type="button" onClick={() => setDetailTab("history")} style={{ ...(detailTab === "history" ? btnPrimary : btnGhost), padding: "6px 14px", fontSize: 13 }}>
            Lịch sử thi đấu
          </button>
          <button type="button" onClick={() => setDetailTab("achievements")} style={{ ...(detailTab === "achievements" ? btnPrimary : btnGhost), padding: "6px 14px", fontSize: 13 }}>
            Thành tích
          </button>
        </div>
        {detailTab === "history" ? (
          history.length === 0 ? (
            <div style={{ padding: 16 }}><EmptyState text="Chưa có lịch sử điểm." /></div>
          ) : (
          <>
            {history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((h, i, arr) => {
              const linkedMatch = h.match ? matches.find((m) => m.id === h.match) : null;
              if (linkedMatch) {
                return (
                  <div key={h.id} className="tt-matchlist" style={{ padding: "0 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                    <MatchRow
                      match={linkedMatch}
                      data={{ players: allPlayers, tournaments }}
                      canManage={canManageMatches}
                      canAddMedia={canEnterMatches}
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
          )
        ) : (
          myResults.length === 0 ? (
            <div style={{ padding: 16 }}><EmptyState text="Chưa có thành tích nào." /></div>
          ) : (
            myResults.map((r, i) => {
              const tournament = tournaments.find((tt) => tt.id === r.tournament);
              const others = [r.player, ...(r.teammates || [])].filter((id) => id !== player.id);
              const otherNames = others.map((id) => allPlayers.find((p) => p.id === id)?.name).filter(Boolean);
              return (
                <AchievementRow key={r.id} result={r} tournament={tournament} otherNames={otherNames} isLast={i === myResults.length - 1} />
              );
            })
          )
        )}
      </div>

      {showPhotoLightbox && (
        <PhotoLightbox url={photoUrl(player)} alt={player.name} onClose={() => setShowPhotoLightbox(false)} />
      )}
    </div>
  );
}

/* ---------- Trang Hồ sơ (Profile) ---------- */
function ProfileTab({ currentUser, players, matches, tournaments, results, history, onChangePassword, onChangeMyPhoto }) {
  const player = currentUser.player_id ? players.find((p) => p.id === currentUser.player_id) : null;
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 20;
  const [showPhotoLightbox, setShowPhotoLightbox] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [detailTab, setDetailTab] = useState("history");
  const myResults = player ? (results || []).filter((r) => r.player === player.id || (r.teammates || []).includes(player.id)) : [];

  const sortedAll = useMemo(() => [...players].sort((a, b) => b.rating - a.rating), [players]);
  const rankNum = player ? sortedAll.findIndex((p) => p.id === player.id) + 1 : null;

  const playerHistory = useMemo(
    () => (player ? history.filter((h) => h.player === player.id) : []),
    [history, player]
  );

  const chronoHistory = useMemo(() => [...playerHistory].reverse(), [playerHistory]);
  const myDelta = useMemo(() => computeDeltaMap(playerHistory)[player?.id] || {}, [playerHistory, player]);
  const chartData = useMemo(() => {
    if (!player) return [];
    const points = chronoHistory.map((h, i) => ({ idx: i + 1, rating: h.after }));
    return [{ idx: 0, rating: chronoHistory.length ? chronoHistory[0].before : player.rating }, ...points];
  }, [chronoHistory, player]);

  const finishedMatches = useMemo(() => {
    if (!player) return [];
    return matches.filter(
      (m) => m.status === "completed" &&
        (m.player_a === player.id || m.player_a2 === player.id || m.player_b === player.id || m.player_b2 === player.id)
    );
  }, [matches, player]);

  const { winCount, lossCount, winRate } = useMemo(() => {
    if (!player || finishedMatches.length === 0) return { winCount: 0, lossCount: 0, winRate: 0 };
    let win = 0;
    for (const m of finishedMatches) {
      const inA = m.player_a === player.id || m.player_a2 === player.id;
      const side = inA ? "A" : "B";
      if (side === m.winner_side) win++;
    }
    const loss = finishedMatches.length - win;
    return { winCount: win, lossCount: loss, winRate: Math.round((win / finishedMatches.length) * 100) };
  }, [finishedMatches, player]);

  const lastMatchInfo = useMemo(() => {
    if (!player || finishedMatches.length === 0) return null;
    const last = [...finishedMatches].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const isDoubles = last.mode === "doi";
    const inA = last.player_a === player.id || last.player_a2 === player.id;
    const selfWon = (inA && last.winner_side === "A") || (!inA && last.winner_side === "B");
    const selfIds = inA ? [last.player_a, last.player_a2] : [last.player_b, last.player_b2];
    const oppIds = inA ? [last.player_b, last.player_b2] : [last.player_a, last.player_a2];
    const selfNames = selfIds.filter(Boolean).map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
    const oppNames = oppIds.filter(Boolean).map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
    const scoreText = inA ? `${last.sets_a}–${last.sets_b}` : `${last.sets_b}–${last.sets_a}`;
    return { selfWon, isDoubles, selfNames, oppNames, scoreText, date: last.date };
  }, [finishedMatches, player, players]);

  async function onPickMyPhoto(e) {
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError("Ảnh vượt quá 1MB, vui lòng chọn ảnh nhỏ hơn.");
      return;
    }
    setPhotoError("");
    setUploadingPhoto(true);
    try {
      await onChangeMyPhoto(file);
    } catch (err) {
      setPhotoError(err.message || "Có lỗi khi tải ảnh lên.");
    }
    setUploadingPhoto(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {player && (
        <>
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
            <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
              <div className="flex items-center gap-3">
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    onClick={() => { if (photoUrl(player)) setShowPhotoLightbox(true); }}
                    style={{ cursor: photoUrl(player) ? "pointer" : "default" }}
                  >
                    <Avatar player={player} size={56} />
                  </div>
                  <label
                    title="Đổi ảnh"
                    style={{
                      position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: "50%",
                      background: C.accent, border: `2px solid ${C.surface}`, display: "flex", alignItems: "center",
                      justifyContent: "center", cursor: "pointer", fontSize: 11,
                    }}
                  >
                    ✎
                    <input type="file" accept="image/*" onChange={onPickMyPhoto} style={{ display: "none" }} disabled={uploadingPhoto} />
                  </label>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONT_DISPLAY }}>
                    <NameWithNickname name={player.name} nickname={player.nickname} />
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                    #{rankNum} / {players.length} VĐV
                  </div>
                  {uploadingPhoto && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Đang tải ảnh lên…</div>}
                  {photoError && <div style={{ fontSize: 11.5, color: C.bad, marginTop: 2 }}>{photoError}</div>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <HangBadge hang={player.hang} />
                <ScorePill value={player.rating} style={{ fontSize: 18, padding: "6px 16px" }} matchDelta={myDelta.matchDelta} achievementBonus={myDelta.achievementBonus} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 14px", textAlign: "center" }}>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 800, color: C.ink, fontFamily: FONT_DISPLAY }}>{finishedMatches.length}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Tổng số trận</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px 14px", textAlign: "center" }}>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 800, color: C.ink, fontFamily: FONT_DISPLAY }}>
                {winCount}<span style={{ color: C.muted, fontSize: 16 }}>–{lossCount}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Thắng–Thua ({winRate}%)</div>
            </div>
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
              {lastMatchInfo ? (
                <>
                  <div className="flex items-center justify-center gap-1.5">
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: "0.5px 5px" }}>
                      {lastMatchInfo.isDoubles ? "ĐÔI" : "ĐƠN"}
                    </span>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, padding: "0.5px 6px", borderRadius: 999,
                        background: lastMatchInfo.selfWon ? C.pillUpBg : C.pillDownBg,
                        color: lastMatchInfo.selfWon ? C.pillUpText : C.pillDownText,
                      }}
                    >
                      {lastMatchInfo.selfWon ? "Thắng" : "Thua"} {lastMatchInfo.scoreText}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.nameColor, marginTop: 5 }}>{lastMatchInfo.selfNames.join(" & ")}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>vs</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.nameColor }}>{lastMatchInfo.oppNames.join(" & ")}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Trận đấu gần nhất · {fmtDate(lastMatchInfo.date)}</div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: C.muted, paddingTop: 4 }}>Chưa có trận nào</div>
              )}
            </div>
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
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}` }} className="flex gap-2">
              <button type="button" onClick={() => setDetailTab("history")} style={{ ...(detailTab === "history" ? btnPrimary : btnGhost), padding: "6px 14px", fontSize: 13 }}>
                Lịch sử thi đấu
              </button>
              <button type="button" onClick={() => setDetailTab("achievements")} style={{ ...(detailTab === "achievements" ? btnPrimary : btnGhost), padding: "6px 14px", fontSize: 13 }}>
                Thành tích
              </button>
            </div>
            {detailTab === "history" ? (
              playerHistory.length === 0 ? (
                <div style={{ padding: 16 }}><EmptyState text="Chưa có lịch sử điểm." /></div>
              ) : (
              <>
                {playerHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((h, i, arr) => {
                  const linkedMatch = h.match ? matches.find((m) => m.id === h.match) : null;
                  if (linkedMatch) {
                    return (
                      <div key={h.id} className="tt-matchlist" style={{ padding: "0 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.line}` : "none" }}>
                        <MatchRow
                          match={linkedMatch}
                          data={{ players, tournaments }}
                          canManage={false}
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
                <Pagination page={historyPage} totalPages={Math.max(1, Math.ceil(playerHistory.length / HISTORY_PAGE_SIZE))} onChange={setHistoryPage} />
              </>
              )
            ) : (
              myResults.length === 0 ? (
                <div style={{ padding: 16 }}><EmptyState text="Chưa có thành tích nào." /></div>
              ) : (
                myResults.map((r, i) => {
                  const tournament = tournaments.find((tt) => tt.id === r.tournament);
                  const others = [r.player, ...(r.teammates || [])].filter((id) => id !== player.id);
                  const otherNames = others.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
                  return (
                    <AchievementRow key={r.id} result={r} tournament={tournament} otherNames={otherNames} isLast={i === myResults.length - 1} />
                  );
                })
              )
            )}
          </div>
        </>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 12 }}>
          Tài khoản
        </div>
        <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{currentUser.username}</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{ROLE_LABEL[currentUser.role] || currentUser.role}</div>
          </div>
          <button style={btnGhost} onClick={onChangePassword}>Đổi mật khẩu</button>
        </div>
      </div>

      {showPhotoLightbox && player && (
        <PhotoLightbox url={photoUrl(player)} alt={player.name} onClose={() => setShowPhotoLightbox(false)} />
      )}
    </div>
  );
}

function PhotoLightbox({ url, alt, onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        style={{
          position: "absolute", top: 20, right: 20, width: 40, height: 40, borderRadius: "50%",
          border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 18,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ✕
      </button>
      <img
        src={url}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }}
      />
    </div>
  );
}

/* ---------- Match row (dùng chung: có thể sửa/xóa) ---------- */
function MatchRow({ match: m, data, canManage, canAddMedia, onEditMatch, onDeleteMatch, showDate, perspectivePlayerId, stageBadge, currentUser, onConfirmMatch, onRejectMatch }) {
  const isDoubles = m.mode === "doi";
  const [editing, setEditing] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmErr, setConfirmErr] = useState("");
  const [mediaCountOverride, setMediaCountOverride] = useState(null);
  const mediaCount = mediaCountOverride ?? m.media_count ?? 0;
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
  if (perspectivePlayerId && m.status === "completed") {
    const isASide = m.player_a === perspectivePlayerId || m.player_a2 === perspectivePlayerId;
    const selfWon = (isASide && m.winner_side === "A") || (!isASide && m.winner_side === "B");
    const scoreText = isASide ? `${m.sets_a}–${m.sets_b}` : `${m.sets_b}–${m.sets_a}`;
    const contextLabel = m.tournament
      ? ((data.tournaments?.find((t) => t.id === m.tournament)?.name || "Giải đấu") + (m.stage && m.stage !== "bang" ? ` · ${stageLabel(m.stage)}` : ""))
      : "Giao hữu";
    const selfDelta = isASide ? m.delta_a : m.delta_b;
    perspective = { selfLabel: isASide ? labelA : labelB, oppLabel: isASide ? labelB : labelA, selfWon, scoreText, contextLabel, isASide, selfDelta };
  }

  // VĐV đang đăng nhập chính là đối thủ CẦN xác nhận (player_b) của trận "Chờ xác nhận" này, và
  // chưa quá ngày diễn ra (đã quá hạn thì BE tự chuyển "het_han", không còn hiện nút nữa).
  const canConfirmThis = !!currentUser?.player_id && m.status === "cho_xac_nhan" && m.player_b === currentUser.player_id && m.date >= todayStr();

  async function doConfirm() {
    setConfirmErr(""); setConfirmBusy(true);
    try { await onConfirmMatch(m.id); } catch (e) { setConfirmErr(e.message || "Có lỗi, vui lòng thử lại."); }
    setConfirmBusy(false);
  }
  async function doReject() {
    setConfirmErr(""); setConfirmBusy(true);
    try { await onRejectMatch(m.id); } catch (e) { setConfirmErr(e.message || "Có lỗi, vui lòng thử lại."); }
    setConfirmBusy(false);
  }

  // Xác định bên trái/phải hiển thị: theo góc nhìn (self bên trái) nếu có, mặc định A bên trái — dùng chung cho đơn & đôi
  const asideLeft = perspective ? perspective.isASide : true;
  const leftPlayers = isDoubles ? (asideLeft ? [pA, pA2] : [pB, pB2]) : [asideLeft ? pA : pB];
  const rightPlayers = isDoubles ? (asideLeft ? [pB, pB2] : [pA, pA2]) : [asideLeft ? pB : pA];
  const leftHandicap = asideLeft ? m.handicap_a : m.handicap_b;
  const rightHandicap = asideLeft ? m.handicap_b : m.handicap_a;

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
    if (!window.confirm(confirmMsg)) return;
    setError("");
    try {
      await onDeleteMatch(m.id);
    } catch (err) {
      // VD: trận thuộc 1 ô sơ đồ vòng loại trực tiếp mà vòng sau đã có trận hoàn tất dựa trên nó.
      setError(err.message || "Không thể xóa trận đấu này.");
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
          {stageBadge && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: stageBadge.color || C.ink, borderRadius: 999, padding: "1px 9px", whiteSpace: "nowrap" }}>
              {stageBadge.text}
            </span>
          )}
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: "1px 7px" }}>
            {isDoubles ? "ĐÔI" : "ĐƠN"}
          </span>
          {(mediaCount > 0 || canAddMedia) && (
            <button
              type="button" onClick={() => setShowMedia(true)}
              style={{
                fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap",
                border: `1px solid ${mediaCount > 0 ? C.accent + "55" : C.line}`, cursor: "pointer",
                background: mediaCount > 0 ? C.accent + "14" : "transparent", color: mediaCount > 0 ? C.accent : C.muted,
              }}
            >
              {mediaCount > 0 ? `🖼 ${mediaCount}` : "+ Ảnh/Video"}
            </button>
          )}
          {m.status !== "completed" ? (
            <MatchTeamsGrid
              leftP1={leftPlayers[0]} leftP2={leftPlayers[1]} rightP1={rightPlayers[0]} rightP2={rightPlayers[1]}
              leftHandicap={leftHandicap} rightHandicap={rightHandicap}
              middle={MATCH_PENDING_LABEL[m.status] || "(chưa có kết quả)"}
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
              <span
                style={{
                  fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, marginRight: 2,
                  background: isDoubles ? C.line : (perspective.selfWon ? C.pillUpBg : C.pillDownBg),
                  color: isDoubles ? C.muted : (perspective.selfWon ? C.pillUpText : C.pillDownText),
                }}
              >
                {isDoubles ? "Không tính điểm" : `${perspective.selfDelta >= 0 ? "+" : "-"}${Math.abs(perspective.selfDelta)}`}
              </span>
              <MatchTeamsGrid
                leftP1={leftPlayers[0]} leftP2={leftPlayers[1]} rightP1={rightPlayers[0]} rightP2={rightPlayers[1]}
                leftHandicap={leftHandicap} rightHandicap={rightHandicap}
                middle={perspective.scoreText}
              />
            </>
          ) : (
            <MatchTeamsGrid
              leftP1={leftPlayers[0]} leftP2={leftPlayers[1]} rightP1={rightPlayers[0]} rightP2={rightPlayers[1]}
              leftHandicap={leftHandicap} rightHandicap={rightHandicap}
              middle={`${m.sets_a}–${m.sets_b}`}
            />
          )}
        </div>
        {/* Trận thuộc giải đấu: không hiển thị ngày riêng — mặc định diễn ra trong khoảng ngày của giải đấu. */}
        {showDate && !m.tournament && <div style={{ fontSize: 12, color: C.muted }}>{fmtDate(m.date)}</div>}
        {perspective && <div style={{ fontSize: 11.5, color: C.muted, opacity: 0.75, marginTop: 1 }}>{perspective.contextLabel}</div>}
      </div>
      <div className="tt-match-right flex items-center gap-3">
        <span className="tabular" style={{ color: C.muted }}>
          {perspective || m.status !== "completed" ? "" : isDoubles ? "Không tính điểm" : <>{m.delta_a >= 0 ? "+" : ""}{m.delta_a} / {m.delta_b >= 0 ? "+" : ""}{m.delta_b}</>}
        </span>
        {canConfirmThis && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1">
              <button type="button" style={{ ...btnPrimary, padding: "4px 10px", fontSize: 12 }} disabled={confirmBusy} onClick={doConfirm}>Xác nhận</button>
              <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, color: C.bad, borderColor: C.bad + "55" }} disabled={confirmBusy} onClick={doReject}>Từ chối</button>
            </div>
            {confirmErr && <div style={{ color: C.bad, fontSize: 11.5, maxWidth: 220, textAlign: "right" }}>{confirmErr}</div>}
          </div>
        )}
        {canManage && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1">
              <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => setEditing(true)}>Sửa</button>
              <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, color: C.bad, borderColor: C.bad + "55" }} onClick={remove}>Xóa</button>
            </div>
            {error && <div style={{ color: C.bad, fontSize: 11.5, maxWidth: 220, textAlign: "right" }}>{error}</div>}
          </div>
        )}
      </div>
      {showMedia && (
        <MatchMediaModal
          matchId={m.id} canAdd={canAddMedia} canDelete={canManage}
          onClose={() => setShowMedia(false)}
          onCountChange={setMediaCountOverride}
        />
      )}
    </div>
  );
}

/* ---------- Thư viện ảnh/video YouTube của 1 trận đấu ---------- */
function YoutubeEmbed({ videoId }) {
  const [playing, setPlaying] = useState(false);
  if (!playing) {
    return (
      <button
        type="button" onClick={() => setPlaying(true)}
        style={{ position: "relative", display: "block", width: "100%", border: "none", padding: 0, cursor: "pointer", borderRadius: 12, overflow: "hidden", background: C.ink }}
      >
        <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="" style={{ width: "100%", display: "block", opacity: 0.85 }} />
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>▶</span>
        </span>
      </button>
    );
  }
  return (
    <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden" }}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1`} title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
      />
    </div>
  );
}

function MatchMediaAddForm({ hasYoutube, photoCount, onAddPhoto, onAddYoutube, onCancel }) {
  const [fillType, setFillType] = useState(photoCount >= 5 && !hasYoutube ? "youtube" : "photo");
  const [file, setFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (fillType === "photo" && !file) { setError("Hãy chọn 1 ảnh."); return; }
    if (fillType === "youtube" && !youtubeUrl.trim()) { setError("Hãy dán link YouTube."); return; }
    setBusy(true);
    try {
      if (fillType === "photo") await onAddPhoto(file, caption.trim());
      else await onAddYoutube(youtubeUrl.trim(), caption.trim());
    } catch (err) {
      setError(err.message || "Có lỗi khi thêm.");
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
      <div className="flex gap-2">
        <button type="button" disabled={photoCount >= 5} onClick={() => setFillType("photo")} style={{ ...(fillType === "photo" ? btnPrimary : btnGhost), padding: "6px 12px", fontSize: 12.5, opacity: photoCount >= 5 ? 0.5 : 1 }}>
          Ảnh {photoCount >= 5 ? "(đã đủ 5)" : ""}
        </button>
        <button type="button" disabled={hasYoutube} onClick={() => setFillType("youtube")} style={{ ...(fillType === "youtube" ? btnPrimary : btnGhost), padding: "6px 12px", fontSize: 12.5, opacity: hasYoutube ? 0.5 : 1 }}>
          Video YouTube {hasYoutube ? "(đã có)" : ""}
        </button>
      </div>
      {fillType === "photo" ? (
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
      ) : (
        <input style={inputStyle} placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
      )}
      <input style={inputStyle} placeholder="Chú thích (tuỳ chọn)" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} />
      {error && <div style={{ color: C.bad, fontSize: 12.5 }}>{error}</div>}
      <div className="flex gap-2">
        <button type="submit" style={{ ...btnPrimary, padding: "6px 14px", fontSize: 13 }} disabled={busy}>{busy ? "Đang lưu…" : "Thêm"}</button>
        <button type="button" style={{ ...btnGhost, padding: "6px 14px", fontSize: 13 }} onClick={onCancel}>Hủy</button>
      </div>
    </form>
  );
}

function MatchMediaModal({ matchId, canAdd, canDelete, onClose, onCountChange }) {
  const [items, setItems] = useState(null); // null = đang tải
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiGet(`/match-media/?match=${matchId}`)
      .then((res) => { if (!cancelled) setItems(res); })
      .catch((e) => { if (!cancelled) setError(e.message || "Không tải được thư viện."); });
    return () => { cancelled = true; };
  }, [matchId]);

  async function refresh() {
    const res = await apiGet(`/match-media/?match=${matchId}`);
    setItems(res);
    onCountChange && onCountChange(res.length);
    return res;
  }

  async function handleAddPhoto(file, caption) {
    const fd = new FormData();
    fd.append("match", matchId); fd.append("media_type", "photo"); fd.append("image", file);
    if (caption) fd.append("caption", caption);
    await apiForm("/match-media/", "POST", fd);
    const res = await refresh();
    setActiveIndex(res.length - 1);
    setShowAddForm(false);
  }

  async function handleAddYoutube(url, caption) {
    const fd = new FormData();
    fd.append("match", matchId); fd.append("media_type", "youtube"); fd.append("youtube_url", url);
    if (caption) fd.append("caption", caption);
    await apiForm("/match-media/", "POST", fd);
    const res = await refresh();
    setActiveIndex(res.length - 1);
    setShowAddForm(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("Xóa ảnh/video này? Không thể hoàn tác.")) return;
    setError("");
    try {
      await apiDelete(`/match-media/${id}/`);
      const res = await refresh();
      setActiveIndex((i) => Math.max(0, Math.min(i, res.length - 1)));
    } catch (e) {
      setError(e.message || "Không xóa được.");
    }
  }

  const active = items && items.length > 0 ? items[activeIndex] : null;
  const photoCount = (items || []).filter((x) => x.media_type === "photo").length;
  const hasYoutube = (items || []).some((x) => x.media_type === "youtube");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.6)", zIndex: 90, overflowY: "auto", padding: "3vh 10px" }} onClick={onClose}>
      <div style={{ background: C.surface, borderRadius: 16, maxWidth: 560, margin: "0 auto", padding: 20 }} className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Ảnh / Video trận đấu</div>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ ...btnGhost, padding: "6px 14px" }}>✕</button>
        </div>

        {items === null ? (
          <div style={{ fontSize: 13, color: C.muted }}>Đang tải…</div>
        ) : items.length === 0 && !showAddForm ? (
          <EmptyState text="Chưa có ảnh/video nào cho trận đấu này." />
        ) : active ? (
          <div className="flex flex-col gap-2">
            {active.media_type === "photo" ? (
              <img src={active.image} alt={active.caption || "Ảnh trận đấu"} style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 12, background: C.bg }} />
            ) : (
              <YoutubeEmbed videoId={active.youtube_video_id} />
            )}
            {active.caption && <div style={{ fontSize: 13, color: C.ink }}>{active.caption}</div>}
            <div className="flex items-center justify-between">
              {items.length > 1 ? (
                <div className="flex items-center gap-2">
                  <button type="button" style={{ ...btnGhost, padding: "4px 12px", fontSize: 13 }} onClick={() => setActiveIndex((i) => (i - 1 + items.length) % items.length)}>‹</button>
                  <span style={{ fontSize: 12, color: C.muted }}>{activeIndex + 1}/{items.length}</span>
                  <button type="button" style={{ ...btnGhost, padding: "4px 12px", fontSize: 13 }} onClick={() => setActiveIndex((i) => (i + 1) % items.length)}>›</button>
                </div>
              ) : <span />}
              {canDelete && (
                <button type="button" style={{ ...btnGhost, padding: "4px 12px", fontSize: 12.5, color: C.bad, borderColor: C.bad + "55" }} onClick={() => handleDelete(active.id)}>Xóa ảnh/video này</button>
              )}
            </div>
          </div>
        ) : null}

        {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}

        {canAdd && items !== null && (
          showAddForm ? (
            <MatchMediaAddForm
              hasYoutube={hasYoutube} photoCount={photoCount}
              onAddPhoto={handleAddPhoto} onAddYoutube={handleAddYoutube}
              onCancel={() => setShowAddForm(false)}
            />
          ) : (
            <button type="button" style={btnGhost} onClick={() => setShowAddForm(true)}>+ Thêm ảnh/video</button>
          )
        )}
      </div>
    </div>
  );
}

/* ---------- Tournaments ---------- */
function TournamentsTab({
  data, canCreate, canEnterResults, canEnterMatches, canManageMatches, canDeleteTournament,
  onAddTournament, onEditTournament, onDeleteTournament, onAddResult,
  onEditResult, onDeleteResult, onAddMatch, onEditMatch, onDeleteMatch,
  onAddGroup, onUpdateGroup, onDeleteGroup, onGenerateBracket, onDeleteBracket, onRenameKnockoutRound,
  onSetSlotBye, onSetSlotMatch, onClearSlot,
  onSetTournamentRegistration, onFetchWaitlist, onAddWaitlistEntry, onUpdateWaitlistEntry, onDeleteWaitlistEntry,
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("khong_chap");
  const [date, setDate] = useState(todayStr());
  const [dateTo, setDateTo] = useState(todayStr());
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
    const finalDateTo = dateTo && dateTo >= date ? dateTo : date;
    Promise.resolve(onAddTournament({ name: name.trim(), type, date, dateTo: finalDateTo })).then((created) => { if (created?.id) setExpanded(created.id); });
    setName(""); setType("khong_chap"); setDate(todayStr()); setDateTo(todayStr()); setOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <div>
          {!open ? (
            <button style={btnPrimary} onClick={() => setOpen(true)}>+ Tạo giải đấu</button>
          ) : (
            <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tên giải"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
                <Field label="Loại giải">
                  <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="khong_chap">Không chấp điểm</option>
                    <option value="co_chap">Có chấp điểm</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Từ ngày">
                  <input
                    type="date" style={inputStyle} value={date}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDate(v);
                      // Mặc định "Đến ngày" đi theo "Từ ngày" cho tới khi người dùng tự sửa (giải 1 ngày là phổ biến nhất).
                      if (!dateTo || dateTo < v) setDateTo(v);
                    }}
                  />
                </Field>
                <Field label="Đến ngày">
                  <input type="date" style={inputStyle} value={dateTo} min={date} onChange={(e) => setDateTo(e.target.value)} />
                </Field>
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
              onEditTournament={onEditTournament} onDeleteTournament={onDeleteTournament} onAddResult={onAddResult}
              onEditResult={onEditResult} onDeleteResult={onDeleteResult}
              onAddMatch={onAddMatch} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch}
              onAddGroup={onAddGroup} onUpdateGroup={onUpdateGroup} onDeleteGroup={onDeleteGroup}
              onGenerateBracket={onGenerateBracket} onDeleteBracket={onDeleteBracket} onRenameKnockoutRound={onRenameKnockoutRound}
              onSetSlotBye={onSetSlotBye} onSetSlotMatch={onSetSlotMatch} onClearSlot={onClearSlot}
              onSetTournamentRegistration={onSetTournamentRegistration}
              onFetchWaitlist={onFetchWaitlist} onAddWaitlistEntry={onAddWaitlistEntry}
              onUpdateWaitlistEntry={onUpdateWaitlistEntry} onDeleteWaitlistEntry={onDeleteWaitlistEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const CONTENT_LABEL = { don: "Đơn", doi: "Đôi", dong_doi: "Đồng đội" };

/* Chọn đồng đội cho nội dung Đôi (đúng 1 slot cố định) / Đồng đội (nhiều slot, thêm/xóa được) */
function TeammatesPicker({ contentType, players, mainPlayerId, teammateIds, setTeammateIds }) {
  if (contentType === "don") return null;

  function setAt(i, val) {
    setTeammateIds((ids) => {
      const next = [...ids];
      while (next.length <= i) next.push("");
      next[i] = val;
      return next;
    });
  }
  function addSlot() {
    setTeammateIds((ids) => [...ids, ""]);
  }
  function removeSlot(i) {
    setTeammateIds((ids) => ids.filter((_, idx) => idx !== i));
  }

  const slots = contentType === "doi" ? (teammateIds.length ? teammateIds : [""]) : teammateIds;

  return (
    <div className="flex flex-col gap-2">
      {slots.map((tid, i) => {
        const usedElsewhere = [Number(mainPlayerId), ...slots.filter((_, idx) => idx !== i).map(Number)].filter(Boolean);
        return (
          <div key={i} className="flex items-center gap-2">
            <div style={{ flex: 1, minWidth: 160 }}>
              <PlayerCombobox players={players} value={tid} onChange={(v) => setAt(i, v)} excludeIds={usedElsewhere} placeholder="— Đồng đội —" />
            </div>
            {contentType === "dong_doi" && (
              <button type="button" style={{ ...btnGhost, padding: "6px 12px", fontSize: 12.5 }} onClick={() => removeSlot(i)}>Xóa</button>
            )}
          </div>
        );
      })}
      {contentType === "dong_doi" && (
        <button type="button" style={{ ...btnGhost, padding: "6px 12px", fontSize: 12.5, alignSelf: "flex-start" }} onClick={addSlot}>+ Thêm đồng đội</button>
      )}
    </div>
  );
}

/* ---------- Dòng thành tích (dùng chung: có thể sửa/xóa, cùng phong cách MatchRow) ---------- */
function ResultRow({ result: r, players, canManage, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [contentType, setContentType] = useState(r.content_type);
  const [playerId, setPlayerId] = useState(r.player);
  const [teammateIds, setTeammateIds] = useState((r.teammates || []).map(String));
  const [placement, setPlacement] = useState(r.placement);
  const [applyBonus, setApplyBonus] = useState(r.bonus_applied);
  const [error, setError] = useState("");

  const p = players.find((pl) => pl.id === r.player);
  const teamNames = (r.teammates || []).map((id) => players.find((pl) => pl.id === id)?.name).filter(Boolean);

  async function save(e) {
    e.preventDefault();
    setError("");
    const cleanTeammates = teammateIds.map(Number).filter(Boolean);
    if (contentType === "doi" && cleanTeammates.length !== 1) { setError("Nội dung Đôi cần đúng 1 đồng đội."); return; }
    if (contentType === "dong_doi" && cleanTeammates.length < 1) { setError("Nội dung Đồng đội cần ít nhất 1 đồng đội."); return; }
    try {
      await onEdit(r.id, { contentType, playerId: Number(playerId), teammateIds: cleanTeammates, placement, saveOnly: !applyBonus });
      setEditing(false);
    } catch (err) {
      setError(err.message || "Có lỗi khi lưu.");
    }
  }

  async function remove() {
    if (!window.confirm("Xóa thành tích này? Nếu đã cộng điểm thưởng, điểm sẽ được hoàn tác cho VĐV/đồng đội liên quan.")) return;
    try {
      await onDelete(r.id);
    } catch (err) {
      alert(err.message || "Có lỗi khi xóa.");
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} style={{ padding: "10px 0", borderBottom: `1px solid ${C.line}` }} className="flex flex-col gap-2">
        <div className="flex gap-2">
          {["don", "doi", "dong_doi"].map((ct) => (
            <button key={ct} type="button" onClick={() => { setContentType(ct); setTeammateIds([]); }} style={{ ...(contentType === ct ? btnPrimary : btnGhost), padding: "6px 12px", fontSize: 12.5 }}>
              {CONTENT_LABEL[ct]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PlayerCombobox players={players} value={playerId} onChange={setPlayerId} />
          <select style={inputStyle} value={placement} onChange={(e) => setPlacement(e.target.value)}>
            <option value="vo_dich">Vô địch</option>
            <option value="a_quan">Á quân</option>
            <option value="hang_ba">Hạng Ba</option>
            <option value="tu_ket">Tứ kết</option>
          </select>
        </div>
        <TeammatesPicker contentType={contentType} players={players} mainPlayerId={playerId} teammateIds={teammateIds} setTeammateIds={setTeammateIds} />
        <label className="flex items-center gap-1.5" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={applyBonus} onChange={(e) => setApplyBonus(e.target.checked)} />
          Cộng điểm thưởng cho VĐV/đồng đội
        </label>
        {error && <div style={{ color: C.bad, fontSize: 12.5 }}>{error}</div>}
        <div className="flex gap-2">
          <button type="submit" style={{ ...btnPrimary, padding: "6px 14px", fontSize: 13 }}>Lưu</button>
          <button type="button" style={{ ...btnGhost, padding: "6px 14px", fontSize: 13 }} onClick={() => setEditing(false)}>Huỷ</button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13.5, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap", gap: 6 }}>
      <div>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: "1px 7px", marginRight: 6 }}>
          {CONTENT_LABEL[r.content_type]}
        </span>
        <span>{BONUS_LABEL[r.placement]} — {p?.name}{teamNames.length ? ` & ${teamNames.join(" & ")}` : ""}</span>
      </div>
      <div className="flex items-center gap-2">
        {r.bonus_applied ? (
          <span className="tabular" style={{ color: "#1E8E52", fontWeight: 700, fontSize: 12.5 }}>+{r.bonus}/người</span>
        ) : (
          <span style={{ color: C.muted, fontSize: 12 }}>Chỉ lưu, không cộng điểm</span>
        )}
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

/* =====================================================================
   QUẢN LÝ GIẢI ĐẤU (popup): Bảng đấu · Vòng loại trực tiếp · Thành tích
   ===================================================================== */
// Nhãn hiển thị cho các giai đoạn CỐ ĐỊNH (bang/ban_ket/chung_ket) + các mã cũ (tương thích dữ
// liệu đã nhập từ trước khi cho phép đặt tên vòng đấu tự do). Vòng đấu tự do: hiển thị đúng
// tên người dùng đã gõ (xem hàm stageLabel bên dưới).
const STAGE_LABEL = {
  bang: "Vòng bảng", vong_1_8: "Vòng 1/8", tu_ket: "Tứ kết",
  ban_ket: "Bán kết", tranh_hang_ba: "Tranh hạng Ba", chung_ket: "Chung kết",
};
function stageLabel(s) {
  return STAGE_LABEL[s] || s;
}
// Gợi ý nhanh khi nhập tên vòng đấu tự do ở tab Vòng loại trực tiếp (chỉ là gợi ý — có thể gõ tên khác).
const KNOCKOUT_STAGE_SUGGESTIONS = ["Vòng 1/32", "Vòng 1/16", "Vòng 1/8", "Tứ kết", "Tranh hạng Ba"];

function namesOf(ids, players) {
  return ids.filter(Boolean).map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
}

/* Xếp hạng trong bảng: nhiều trận thắng hơn → hiệu số ván → điểm rating */
function groupStandings(group, matches, players) {
  const rows = group.players
    .map((id) => ({ id, player: players.find((p) => p.id === id), w: 0, l: 0, sw: 0, sl: 0 }))
    .filter((r) => r.player);
  matches.filter((m) => m.group === group.id && m.status === "completed").forEach((m) => {
    const aWon = m.winner_side === "A";
    [m.player_a, m.player_a2].filter(Boolean).forEach((id) => {
      const r = rows.find((x) => x.id === id);
      if (r) { aWon ? r.w++ : r.l++; r.sw += m.sets_a; r.sl += m.sets_b; }
    });
    [m.player_b, m.player_b2].filter(Boolean).forEach((id) => {
      const r = rows.find((x) => x.id === id);
      if (r) { aWon ? r.l++ : r.w++; r.sw += m.sets_b; r.sl += m.sets_a; }
    });
  });
  rows.sort((x, y) => y.w - x.w || (y.sw - y.sl) - (x.sw - x.sl) || y.player.rating - x.player.rating);
  return rows;
}

/* ---------- Thẻ 1 bảng đấu (giao diện dạng lưới, giống mẫu "Bảng A") ---------- */
function GroupCard({ group, tournamentGroups, matches, players, canManage, onUpdate, onDelete, canEditMatches, canAddMedia, onEditMatch, onDeleteMatch }) {
  const [editing, setEditing] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [err, setErr] = useState("");
  const rows = groupStandings(group, matches, players);
  const usedIds = tournamentGroups.flatMap((g) => g.players);
  const groupMatches = matches.filter((m) => m.group === group.id);
  const matchData = useMemo(() => ({ players }), [players]);

  async function addMember(idStr) {
    setErr("");
    if (!idStr) return;
    try { await onUpdate(group.id, { players: [...group.players, Number(idStr)] }); }
    catch (e) { setErr(e.message); }
  }
  async function removeMember(id) {
    const hasMatch = groupMatches.some((m) => [m.player_a, m.player_a2, m.player_b, m.player_b2].includes(id));
    if (hasMatch && !window.confirm("VĐV này đã có trận trong bảng. Gỡ khỏi bảng sẽ KHÔNG xóa các trận đó. Tiếp tục?")) return;
    setErr("");
    try { await onUpdate(group.id, { players: group.players.filter((x) => x !== id) }); }
    catch (e) { setErr(e.message); }
  }
  async function removeGroup() {
    const msg = `Xóa Bảng ${group.name}?` +
      (groupMatches.length ? `\n\n${groupMatches.length} trận vòng bảng thuộc bảng này cũng sẽ bị xóa và điểm của các VĐV được hoàn tác.` : "");
    if (!window.confirm(msg)) return;
    try { await onDelete(group.id); } catch (e) { alert(e.message); }
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <div className="flex items-center justify-between" style={{ padding: "12px 14px", background: C.bg, borderRadius: "13px 13px 0 0" }}>
        <div className="flex items-center gap-3">
          <span
            style={{
              width: 34, height: 34, borderRadius: 10, background: C.ink, color: "#fff", display: "flex",
              alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, fontFamily: FONT_DISPLAY,
            }}
          >
            {group.name}
          </span>
          <span style={{ fontWeight: 800, fontSize: 16, fontFamily: FONT_DISPLAY, color: C.ink }}>Bảng {group.name}</span>
        </div>
        {canManage && (
          <div className="flex gap-1">
            <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => setEditing((v) => !v)}>
              {editing ? "Xong" : "Sửa VĐV"}
            </button>
            <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, color: C.bad, borderColor: C.bad + "55" }} onClick={removeGroup}>
              Xóa
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "14px", fontSize: 13, color: C.muted }}>Chưa có VĐV trong bảng này.</div>
      ) : (
        rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-3" style={{ padding: "10px 14px", borderTop: `1px solid ${C.line}` }}>
            <span className="tabular" style={{ width: 30, fontStyle: "italic", fontWeight: 800, color: i === 0 ? C.accent : C.muted }}>#{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: C.nameColor, overflowWrap: "anywhere" }}>
                <NameWithNickname name={r.player.name} nickname={r.player.nickname} />
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: 3, flexWrap: "wrap" }}>
                <span className="tabular" style={{ background: C.pillScoreBg, color: C.pillScoreText, fontWeight: 700, fontSize: 11.5, padding: "2px 9px", borderRadius: 999 }}>
                  {r.player.rating} PTS
                </span>
                {r.w + r.l > 0 && (
                  <span style={{ fontSize: 11.5, color: C.muted }}>
                    Thắng <b style={{ color: C.pillUpText }}>{r.w}</b> · Thua <b style={{ color: C.pillDownText }}>{r.l}</b>
                  </span>
                )}
              </div>
            </div>
            {editing && canManage && (
              <button type="button" aria-label="Gỡ khỏi bảng" onClick={() => removeMember(r.id)} style={{ ...btnGhost, padding: "2px 9px", fontSize: 12, color: C.bad, borderColor: C.bad + "55" }}>✕</button>
            )}
          </div>
        ))
      )}

      {editing && canManage && (
        <div style={{ padding: 12, borderTop: `1px solid ${C.line}` }} className="flex flex-col gap-2">
          <PlayerCombobox players={players} value="" onChange={addMember} excludeIds={usedIds} placeholder="— Thêm VĐV vào bảng —" />
          {err && <div style={{ color: C.bad, fontSize: 12.5 }}>{err}</div>}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.line}` }}>
        <button
          type="button"
          onClick={() => setShowMatches((v) => !v)}
          disabled={groupMatches.length === 0}
          aria-expanded={showMatches}
          className="tt-group-toggle flex items-center justify-between"
          style={{
            width: "100%", padding: "11px 14px", background: showMatches ? C.ink + "0F" : "transparent",
            border: "none", borderRadius: 0,
            cursor: groupMatches.length === 0 ? "default" : "pointer", textAlign: "left", gap: 10,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: groupMatches.length === 0 ? C.muted : C.ink }}>
            {groupMatches.length === 0
              ? "Trận vòng bảng (0)"
              : showMatches ? `Đang xem ${groupMatches.length} trận đấu` : `Xem chi tiết ${groupMatches.length} trận đấu`}
          </span>
          {groupMatches.length > 0 && (
            <span
              aria-hidden="true"
              style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: showMatches ? C.ink : C.ink + "1A",
                color: showMatches ? "#fff" : C.ink,
                fontSize: 11, lineHeight: 1, transition: "transform 160ms ease, background 120ms ease, color 120ms ease",
                transform: showMatches ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              ▾
            </span>
          )}
        </button>
        {groupMatches.length === 0 ? (
          <div style={{ padding: "0 14px 14px", fontSize: 12.5, color: C.muted }}>Chưa có trận nào trong bảng này.</div>
        ) : !showMatches ? null : (
          <div className="tt-matchlist" style={{ padding: "0 14px 6px" }}>
            {groupMatches.map((m) => (
              <MatchRow
                key={m.id} match={m} data={matchData} canManage={canEditMatches} canAddMedia={canAddMedia}
                onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch} showDate
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Form nhập 1 trận trong giải (vòng bảng hoặc loại trực tiếp) ---------- */
function TournamentMatchForm({ tournament, players, groups, kind, onAddMatch, handicapRules }) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  // Vòng đấu (chỉ áp dụng kind==="knockout"): "ban_ket" / "chung_ket" là 2 giá trị cố định;
  // "custom" = người dùng tự gõ tên vòng đấu (VD: Vòng 1/8, Vòng 1/16, Tứ kết, Tranh hạng Ba...).
  const [stageMode, setStageMode] = useState("custom");
  const [customStage, setCustomStage] = useState("");
  const [mode, setMode] = useState("don");
  const [status, setStatus] = useState("completed");
  const [a, setA] = useState(""); const [a2, setA2] = useState("");
  const [b, setB] = useState(""); const [b2, setB2] = useState("");
  const [setsA, setSetsA] = useState(3); const [setsB, setSetsB] = useState(0);
  const [handicapA, setHandicapA] = useState(""); const [handicapB, setHandicapB] = useState("");
  const [msg, setMsg] = useState(""); const [error, setError] = useState("");

  const gid = groupId || (groups[0] ? String(groups[0].id) : "");
  const group = kind === "group" ? groups.find((g) => String(g.id) === gid) : null;
  const pool = kind === "group" ? players.filter((p) => group?.players.includes(p.id)) : players;
  const scheduled = status === "scheduled";
  const pA = pool.find((p) => p.id === Number(a));
  const pB = pool.find((p) => p.id === Number(b));
  const stage = kind === "group" ? "bang" : (stageMode === "custom" ? customStage.trim() : stageMode);

  function resetPlayers() { setA(""); setA2(""); setB(""); setB2(""); }

  async function submit(e) {
    e.preventDefault();
    setError(""); setMsg("");
    if (kind === "group" && !group) { setError("Hãy tạo bảng và thêm VĐV vào bảng trước."); return; }
    if (kind === "knockout" && stageMode === "custom" && !customStage.trim()) { setError("Hãy nhập tên vòng đấu (VD: Vòng 1/8, Tứ kết…)."); return; }
    if (!scheduled && Number(setsA) === Number(setsB)) { setError("Tỷ số không thể hòa."); return; }
    const ids = mode === "doi" ? [a, a2, b, b2] : [a, b];
    if (ids.some((x) => !x)) { setError("Hãy chọn đủ VĐV cho trận đấu."); return; }
    if (new Set(ids).size !== ids.length) { setError("Các VĐV trong trận phải khác nhau."); return; }
    if (handicapA.trim() && !HANDICAP_FORMAT_RE.test(handicapA.trim())) { setError("Điểm chấp VĐV A không đúng định dạng (VD: 2-0-2)."); return; }
    if (handicapB.trim() && !HANDICAP_FORMAT_RE.test(handicapB.trim())) { setError("Điểm chấp VĐV B không đúng định dạng (VD: 2-0-2)."); return; }
    try {
      await onAddMatch({
        tournamentId: tournament.id, mode, status,
        playerAId: Number(a), playerBId: Number(b),
        playerA2Id: mode === "doi" ? Number(a2) : undefined, playerB2Id: mode === "doi" ? Number(b2) : undefined,
        setsA: scheduled ? null : Number(setsA), setsB: scheduled ? null : Number(setsB),
        stage, groupId: kind === "group" ? Number(gid) : null,
        handicapA: handicapA.trim(), handicapB: handicapB.trim(),
      });
      setMsg(scheduled ? "Đã tạo trận sắp diễn ra." : "Đã lưu kết quả trận đấu.");
      resetPlayers(); setSetsA(3); setSetsB(0); setHandicapA(""); setHandicapB(""); setCustomStage("");
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setError(err.message || "Có lỗi khi lưu trận đấu.");
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" style={btnPrimary} onClick={() => setOpen(true)}>+ Nhập trận đấu</button>
        {msg && <span style={{ fontSize: 13, color: "#1E8E52", fontWeight: 600 }}>{msg}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }} className="flex flex-col gap-3">
      <div style={{ fontWeight: 700 }}>{kind === "group" ? "Nhập trận vòng bảng" : "Nhập trận vòng loại trực tiếp"}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {kind === "group" ? (
          <Field label="Bảng đấu">
            <select style={inputStyle} value={gid} onChange={(e) => { setGroupId(e.target.value); resetPlayers(); }}>
              {groups.map((g) => <option key={g.id} value={g.id}>Bảng {g.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Vòng đấu">
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              <button type="button" onClick={() => setStageMode("custom")} style={{ ...(stageMode === "custom" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Vòng khác…</button>
              <button type="button" onClick={() => setStageMode("ban_ket")} style={{ ...(stageMode === "ban_ket" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Bán kết</button>
              <button type="button" onClick={() => setStageMode("chung_ket")} style={{ ...(stageMode === "chung_ket" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Chung kết</button>
            </div>
          </Field>
        )}
        <Field label="Thể thức">
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMode("don"); resetPlayers(); }} style={{ ...(mode === "don" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Đánh đơn</button>
            <button type="button" onClick={() => { setMode("doi"); resetPlayers(); }} style={{ ...(mode === "doi" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Đánh đôi</button>
          </div>
        </Field>
        <Field label="Trạng thái trận đấu">
          <div className="flex gap-4" style={{ fontSize: 14, paddingTop: 8 }}>
            <label className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
              <input type="radio" name={`ms-${kind}`} checked={!scheduled} onChange={() => setStatus("completed")} /> Kết thúc
            </label>
            <label className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
              <input type="radio" name={`ms-${kind}`} checked={scheduled} onChange={() => setStatus("scheduled")} /> Sắp diễn ra
            </label>
          </div>
        </Field>
      </div>

      {kind === "knockout" && stageMode === "custom" && (
        <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }} className="flex flex-col gap-2">
          <Field label="Tên vòng đấu">
            <input style={inputStyle} placeholder="VD: Vòng 1/8, Vòng 1/16, Tứ kết…" value={customStage} onChange={(e) => setCustomStage(e.target.value)} maxLength={30} />
          </Field>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>Gợi ý:</span>
            {KNOCKOUT_STAGE_SUGGESTIONS.map((s) => (
              <button
                key={s} type="button" onClick={() => setCustomStage(s)}
                style={{ ...btnGhost, padding: "3px 11px", fontSize: 12, borderRadius: 999 }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div className="flex flex-col gap-2">
          <Field label={mode === "doi" ? "Đội A — VĐV 1" : "VĐV A"}><PlayerCombobox players={pool} value={a} onChange={setA} excludeIds={[Number(b), Number(a2), Number(b2)].filter(Boolean)} /></Field>
          {mode === "doi" && <Field label="Đội A — VĐV 2"><PlayerCombobox players={pool} value={a2} onChange={setA2} excludeIds={[Number(a), Number(b), Number(b2)].filter(Boolean)} /></Field>}
        </div>
        <div className="flex flex-col gap-2">
          <Field label={mode === "doi" ? "Đội B — VĐV 1" : "VĐV B"}><PlayerCombobox players={pool} value={b} onChange={setB} excludeIds={[Number(a), Number(a2), Number(b2)].filter(Boolean)} /></Field>
          {mode === "doi" && <Field label="Đội B — VĐV 2"><PlayerCombobox players={pool} value={b2} onChange={setB2} excludeIds={[Number(a), Number(a2), Number(b)].filter(Boolean)} /></Field>}
        </div>
      </div>

      {!scheduled && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <Field label="Số ván thắng — bên A"><input type="number" min="0" style={inputStyle} value={setsA} onChange={(e) => setSetsA(e.target.value)} /></Field>
          <Field label="Số ván thắng — bên B"><input type="number" min="0" style={inputStyle} value={setsB} onChange={(e) => setSetsB(e.target.value)} /></Field>
        </div>
      )}

      <HandicapFields
        tournamentType={tournament.type} mode={mode} pA={pA} pB={pB}
        handicapA={handicapA} handicapB={handicapB} setHandicapA={setHandicapA} setHandicapB={setHandicapB}
        rules={handicapRules}
      />

      {kind === "group" && pool.length < 2 && (
        <div style={{ fontSize: 13, color: C.muted }}>Bảng này chưa đủ 2 VĐV — hãy bấm "Sửa VĐV" ở thẻ bảng để thêm VĐV.</div>
      )}
      {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <button type="submit" style={btnPrimary}>{scheduled ? "Tạo trận sắp diễn ra" : "Lưu kết quả"}</button>
        <button type="button" style={btnGhost} onClick={() => { setOpen(false); setError(""); }}>Đóng form</button>
        {msg && <span style={{ fontSize: 13, color: "#1E8E52", fontWeight: 600 }}>{msg}</span>}
      </div>
    </form>
  );
}

/* ---------- Thẻ trận trong sơ đồ loại trực tiếp ---------- */
function BracketMatchCard({ match: m, players }) {
  const done = m.status === "completed";
  const aNames = namesOf([m.player_a, m.player_a2], players);
  const bNames = namesOf([m.player_b, m.player_b2], players);
  const aWon = done && m.winner_side === "A";
  const bWon = done && m.winner_side === "B";

  const row = (names, won, sets, handicap) => (
    <div
      className="flex items-center justify-between gap-2"
      style={{
        padding: "8px 10px", background: won ? C.pillUpBg : "transparent",
        color: won ? C.pillUpText : (done ? C.muted : C.nameColor), fontWeight: won ? 800 : 600, fontSize: 13.5,
      }}
    >
      <span style={{ overflowWrap: "anywhere" }}>{names.join(" & ") || "—"}<HandicapTag value={handicap} /></span>
      <span className="tabular" style={{ fontWeight: 800 }}>{done ? sets : "–"}</span>
    </div>
  );

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      {row(aNames, aWon, m.sets_a, m.handicap_a)}
      <div style={{ borderTop: `1px solid ${C.line}` }} />
      {row(bNames, bWon, m.sets_b, m.handicap_b)}
      {!done && (
        <div style={{ padding: "3px 10px", background: C.gold + "22", color: C.gold, fontSize: 10.5, fontWeight: 700, textAlign: "center" }}>SẮP DIỄN RA</div>
      )}
      {m.mode === "doi" && (
        <div style={{ padding: "2px 10px", fontSize: 10.5, color: C.muted, textAlign: "center", borderTop: `1px solid ${C.line}` }}>ĐÔI</div>
      )}
    </div>
  );
}

/* ---------- Tab "Bảng đấu" ---------- */
function GroupsPanel({ tournament, data, canManageGroups, canEnterMatch, canEditMatches, onAddGroup, onUpdateGroup, onDeleteGroup, onAddMatch, onEditMatch, onDeleteMatch }) {
  const [err, setErr] = useState("");
  const groups = (data.groups || []).filter((g) => g.tournament === tournament.id);
  const tMatches = data.matches.filter((m) => m.tournament === tournament.id);
  const unassigned = tMatches.filter((m) => !m.stage);

  async function createGroup() {
    setErr("");
    const used = new Set(groups.map((g) => g.name));
    const name = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((l) => !used.has(l));
    if (!name) { setErr("Đã dùng hết tên bảng A–Z."); return; }
    try { await onAddGroup({ tournamentId: tournament.id, name, playerIds: [] }); }
    catch (e) { setErr(e.message); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Bảng đấu ({groups.length})</div>
        {canManageGroups && <button type="button" style={btnPrimary} onClick={createGroup}>+ Thêm bảng</button>}
      </div>
      {err && <div style={{ color: C.bad, fontSize: 13 }}>{err}</div>}

      {groups.length === 0 ? (
        <EmptyState text={canManageGroups ? "Chưa có bảng đấu nào — bấm “+ Thêm bảng” để tạo Bảng A, B, C…" : "Giải đấu này chưa có bảng đấu."} />
      ) : (
        <div className="tt-groups-grid">
          {groups.map((g) => (
            <GroupCard
              key={g.id} group={g} tournamentGroups={groups} matches={tMatches} players={data.players}
              canManage={canManageGroups} onUpdate={onUpdateGroup} onDelete={onDeleteGroup}
              canEditMatches={canEditMatches} canAddMedia={canEnterMatch} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch}
            />
          ))}
        </div>
      )}

      {canEnterMatch && groups.length > 0 && (
        <TournamentMatchForm tournament={tournament} players={data.players} groups={groups} kind="group" onAddMatch={onAddMatch} handicapRules={data.handicapRules} />
      )}

      {unassigned.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>Trận chưa phân vòng/bảng ({unassigned.length})</div>
          <div className="tt-matchlist" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "6px 16px" }}>
            {unassigned.map((m) => (
              <MatchRow key={m.id} match={m} data={data} canManage={canEditMatches} canAddMedia={canEnterMatch} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch} showDate={false} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Sơ đồ vòng loại trực tiếp: hằng số dùng chung ---------- */
const KNOCKOUT_SIZES = [2, 4, 8, 16, 32];
const KNOCKOUT_DEFAULT_NAMES = { 1: "Chung kết", 2: "Bán kết", 4: "Tứ kết", 8: "Vòng 1/8", 16: "Vòng 1/16", 32: "Vòng 1/32" };

/* ---------- Form "Tạo sơ đồ đấu": chọn số trận vòng đầu, sinh toàn bộ khung tới Chung kết ---------- */
function GenerateBracketForm({ onGenerate }) {
  const [size, setSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(() => {
    const rows = [];
    let n = size;
    while (n >= 1) { rows.push(KNOCKOUT_DEFAULT_NAMES[n] || `Vòng ${n} trận`); n = n / 2; }
    return rows;
  }, [size]);

  async function submit() {
    setError(""); setBusy(true);
    try { await onGenerate(size); }
    catch (err) { setError(err.message || "Có lỗi khi tạo sơ đồ."); setBusy(false); return; }
    setBusy(false);
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }} className="flex flex-col gap-3">
      <div style={{ fontWeight: 700 }}>Tạo sơ đồ đấu</div>
      <Field label="Số trận ở vòng đầu tiên">
        <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
          {KNOCKOUT_SIZES.map((s) => (
            <button
              key={s} type="button" onClick={() => setSize(s)}
              style={{ ...(size === s ? btnPrimary : btnGhost), padding: "8px 16px", fontSize: 13.5 }}
            >
              {s} trận <span style={{ opacity: 0.75 }}>({s * 2} chỗ)</span>
            </button>
          ))}
        </div>
      </Field>
      <div style={{ fontSize: 12.5, color: C.muted }}>
        Sơ đồ sẽ có {preview.length} vòng: {preview.join(" → ")}. Nếu số VĐV thực tế ít hơn số chỗ, dùng tùy chọn
        "Miễn đấu (BYE)" khi xếp cặp để VĐV đó vào thẳng vòng sau — đặt tên lại từng vòng được sau khi tạo.
      </div>
      {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
      <div><button type="button" style={btnPrimary} onClick={submit} disabled={busy}>{busy ? "Đang tạo…" : "Tạo sơ đồ"}</button></div>
    </div>
  );
}

/* ---------- Sơ đồ cũ (trước khi có tính năng này): chỉ xem/sửa/xóa, không tạo trận mới kiểu này nữa ---------- */
function LegacyKnockoutView({ matches, data, canEditMatches, canAddMedia, onEditMatch, onDeleteMatch }) {
  const byStage = (s) => matches.filter((m) => m.stage === s).sort((x, y) => x.id - y.id);
  const minIdOf = (s) => Math.min(...matches.filter((m) => m.stage === s).map((m) => m.id));
  const customStages = [...new Set(matches.map((m) => m.stage))]
    .filter((s) => s !== "ban_ket" && s !== "chung_ket")
    .sort((sA, sB) => minIdOf(sA) - minIdOf(sB));
  const stageOrder = [...customStages, "ban_ket", "chung_ket"].filter((s) => byStage(s).length > 0);

  return (
    <div className="flex flex-col gap-3">
      <div style={{ fontSize: 12.5, color: C.muted, background: C.ink + "0A", border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 12px" }}>
        Các trận bên dưới được nhập theo cách cũ (trước khi có sơ đồ trực quan). Vẫn xem/sửa/xóa được như bình thường — bấm "Tạo sơ đồ đấu" ở trên để dùng sơ đồ có đường dẫn tự động cho các trận tiếp theo.
      </div>
      <div className="tt-bracket">
        {stageOrder.map((s) => (
          <div key={s} className="tt-bracket-col">
            <div className="flex flex-col gap-2">
              <div style={{ fontSize: 11.5, fontWeight: 800, color: s === "chung_ket" ? C.accent : C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {stageLabel(s)}
              </div>
              {byStage(s).map((m) => <BracketMatchCard key={m.id} match={m} players={data.players} />)}
            </div>
          </div>
        ))}
      </div>
      {canEditMatches && (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>Quản lý trận (sửa / xóa)</div>
          <div className="tt-matchlist" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "6px 16px" }}>
            {[...matches].sort((x, y) => stageOrder.indexOf(x.stage) - stageOrder.indexOf(y.stage) || x.id - y.id).map((m) => (
              <MatchRow
                key={m.id} match={m} data={data} canManage canAddMedia={canAddMedia} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch}
                showDate={false} stageBadge={{ text: stageLabel(m.stage), color: C.accent }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 1 ô trong sơ đồ: trống / miễn đấu (BYE) / đã có trận ---------- */
function KnockoutSlotCard({ slot, allSlots, players, canFill, canOverride, onOpenFill }) {
  const hasMatch = !!slot.match;
  const hasBye = !!slot.bye_player_name;
  const filled = hasMatch || hasBye;

  const feederA = allSlots.find((s) => s.round_no === slot.round_no - 1 && s.slot_index === slot.slot_index * 2);
  const feederB = allSlots.find((s) => s.round_no === slot.round_no - 1 && s.slot_index === slot.slot_index * 2 + 1);
  const readyToFill = slot.round_no === 1 || (!!feederA?.winner_player_id && !!feederB?.winner_player_id);
  const clickable = !filled && readyToFill && (canFill || canOverride);

  if (hasMatch) {
    return (
      <div style={{ position: "relative" }}>
        <BracketMatchCard match={slot.match} players={players} />
        {canOverride && (
          <button
            type="button" aria-label="Sửa ô này" onClick={onOpenFill}
            style={{
              position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%",
              border: "none", background: "rgba(255,255,255,0.92)", color: C.ink, fontSize: 12,
              cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            }}
          >
            ✎
          </button>
        )}
        {slot.locked && (
          <div style={{ marginTop: 3, fontSize: 10.5, color: C.muted, textAlign: "center" }}>🔒 Đã khóa (vòng sau đã có kết quả)</div>
        )}
      </div>
    );
  }

  if (hasBye) {
    const names = [slot.bye_player_name, slot.bye_player2_name].filter(Boolean).join(" & ");
    return (
      <div style={{ position: "relative", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px" }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: C.ink }}>{names}</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.gold, marginTop: 2 }}>MIỄN ĐẤU (BYE) — VÀO THẲNG VÒNG SAU</div>
        {canOverride && (
          <button
            type="button" aria-label="Sửa ô này" onClick={onOpenFill}
            style={{
              position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%",
              border: "none", background: C.bg, color: C.ink, fontSize: 12, cursor: "pointer",
            }}
          >
            ✎
          </button>
        )}
      </div>
    );
  }

  if (!readyToFill) {
    const known = [feederA?.winner_name, feederB?.winner_name].filter(Boolean);
    return (
      <div style={{ background: C.bg, border: `1px dashed ${C.line}`, borderRadius: 12, padding: "10px 12px", opacity: 0.8 }}>
        <div style={{ fontSize: 12.5, color: C.muted }}>Chờ kết quả vòng trước…</div>
        {known.length > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Đã biết: {known.join(" — ")}</div>}
      </div>
    );
  }

  // Trống, sẵn sàng xếp cặp
  const suggested = slot.round_no > 1 ? [feederA?.winner_name, feederB?.winner_name].filter(Boolean) : [];
  return clickable ? (
    <button
      type="button" onClick={onOpenFill}
      style={{
        width: "100%", textAlign: "left", background: C.ink + "0A", border: `1.5px dashed ${C.ink}55`, borderRadius: 12,
        padding: "10px 12px", cursor: "pointer", color: C.ink, fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>+ Xếp cặp đấu</div>
      {suggested.length > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Dự kiến: {suggested.join(" vs ")}</div>}
    </button>
  ) : (
    <div style={{ background: C.bg, border: `1px dashed ${C.line}`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 12.5, color: C.muted }}>Chưa xếp cặp</div>
    </div>
  );
}

/* ---------- Popup xếp cặp 1 ô sơ đồ: trận đấu thật HOẶC miễn đấu (BYE) ---------- */
function SlotFillModal({ slot, players, suggested, excludeIds, onClose, onSetBye, onSetMatch, onClear, canClear, tournamentType, handicapRules }) {
  const roundExcludeIds = excludeIds || [];
  const existingMatch = slot.match;
  const isBye = !!slot.bye_player_name;
  const [fillType, setFillType] = useState(isBye ? "bye" : "match");
  const [mode, setMode] = useState(slot.mode || "don");
  const [status, setStatus] = useState(existingMatch ? existingMatch.status : "completed");
  const [a, setA] = useState(existingMatch ? String(existingMatch.player_a) : (isBye ? String(slot.bye_player) : (suggested?.aId ? String(suggested.aId) : "")));
  const [a2, setA2] = useState(existingMatch?.player_a2 ? String(existingMatch.player_a2) : (isBye && slot.bye_player2 ? String(slot.bye_player2) : (suggested?.a2Id ? String(suggested.a2Id) : "")));
  const [b, setB] = useState(existingMatch ? String(existingMatch.player_b) : (suggested?.bId ? String(suggested.bId) : ""));
  const [b2, setB2] = useState(existingMatch?.player_b2 ? String(existingMatch.player_b2) : (suggested?.b2Id ? String(suggested.b2Id) : ""));
  const [setsA, setSetsA] = useState(existingMatch?.sets_a ?? 3);
  const [setsB, setSetsB] = useState(existingMatch?.sets_b ?? 0);
  const [handicapA, setHandicapA] = useState(existingMatch?.handicap_a || "");
  const [handicapB, setHandicapB] = useState(existingMatch?.handicap_b || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const scheduled = status === "scheduled";
  const pA = players.find((p) => p.id === Number(a));
  const pB = players.find((p) => p.id === Number(b));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (fillType === "bye") {
      if (!a) { setError("Hãy chọn VĐV được miễn đấu."); return; }
      if (mode === "doi" && !a2) { setError("Đánh đôi cần chọn đủ 2 VĐV cho bên miễn đấu."); return; }
      setBusy(true);
      try { await onSetBye(slot.id, { mode, playerId: Number(a), player2Id: mode === "doi" ? Number(a2) : null }); }
      catch (err) { setError(err.message || "Có lỗi khi lưu."); setBusy(false); return; }
      setBusy(false); onClose(); return;
    }
    const ids = mode === "doi" ? [a, a2, b, b2] : [a, b];
    if (ids.some((x) => !x)) { setError("Hãy chọn đủ VĐV cho trận đấu."); return; }
    if (new Set(ids).size !== ids.length) { setError("Các VĐV trong trận phải khác nhau."); return; }
    if (!scheduled && Number(setsA) === Number(setsB)) { setError("Tỷ số không thể hòa."); return; }
    if (handicapA.trim() && !HANDICAP_FORMAT_RE.test(handicapA.trim())) { setError("Điểm chấp VĐV A không đúng định dạng (VD: 2-0-2)."); return; }
    if (handicapB.trim() && !HANDICAP_FORMAT_RE.test(handicapB.trim())) { setError("Điểm chấp VĐV B không đúng định dạng (VD: 2-0-2)."); return; }
    setBusy(true);
    try {
      await onSetMatch(slot.id, {
        mode, status, playerAId: Number(a), playerBId: Number(b),
        playerA2Id: mode === "doi" ? Number(a2) : undefined, playerB2Id: mode === "doi" ? Number(b2) : undefined,
        setsA: scheduled ? null : Number(setsA), setsB: scheduled ? null : Number(setsB),
        handicapA: handicapA.trim(), handicapB: handicapB.trim(),
      });
    } catch (err) { setError(err.message || "Có lỗi khi lưu."); setBusy(false); return; }
    setBusy(false); onClose();
  }

  async function doClear() {
    if (!window.confirm("Bỏ trống lại ô này? Trận/VĐV miễn đấu hiện tại (nếu có) sẽ bị xóa, điểm Elo liên quan (nếu có) sẽ được hoàn tác.")) return;
    setError(""); setBusy(true);
    try { await onClear(slot.id); }
    catch (err) { setError(err.message || "Có lỗi."); setBusy(false); return; }
    setBusy(false); onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", zIndex: 85, overflowY: "auto", padding: "3vh 10px" }}>
      <form onSubmit={submit} style={{ background: C.surface, borderRadius: 16, maxWidth: 560, margin: "0 auto", padding: 20 }} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {slot.stage_name} — Trận {slot.slot_index + 1}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Xếp cặp đấu</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ ...btnGhost, padding: "6px 14px", flexShrink: 0 }}>✕</button>
        </div>

        {slot.locked ? (
          <div style={{ color: C.bad, fontSize: 13 }}>
            Không thể sửa ô này — vòng sau đã có trận hoàn tất dựa trên kết quả ô này. Hãy xóa trận đó trước rồi mới quay lại sửa ô này.
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button type="button" onClick={() => setFillType("match")} style={{ ...(fillType === "match" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Trận đấu</button>
              <button type="button" onClick={() => setFillType("bye")} style={{ ...(fillType === "bye" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Miễn đấu (BYE)</button>
            </div>

            <Field label="Thể thức">
              <div className="flex gap-2">
                <button type="button" onClick={() => { setMode("don"); setA2(""); setB2(""); }} style={{ ...(mode === "don" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Đánh đơn</button>
                <button type="button" onClick={() => setMode("doi")} style={{ ...(mode === "doi" ? btnPrimary : btnGhost), padding: "8px 14px", fontSize: 13 }}>Đánh đôi</button>
              </div>
            </Field>

            {fillType === "bye" ? (
              <div className="flex flex-col gap-2">
                <Field label={mode === "doi" ? "Cặp miễn đấu — VĐV 1" : "VĐV miễn đấu"}>
                  <PlayerCombobox players={players} value={a} onChange={setA} excludeIds={[Number(a2), ...roundExcludeIds].filter(Boolean)} />
                </Field>
                {mode === "doi" && (
                  <Field label="Cặp miễn đấu — VĐV 2">
                    <PlayerCombobox players={players} value={a2} onChange={setA2} excludeIds={[Number(a), ...roundExcludeIds].filter(Boolean)} />
                  </Field>
                )}
                <div style={{ fontSize: 11.5, color: C.muted }}>VĐV/cặp này coi như thắng ngay, vào thẳng vòng sau — không tính điểm Elo.</div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <div className="flex flex-col gap-2">
                    <Field label={mode === "doi" ? "Đội A — VĐV 1" : "VĐV A"}><PlayerCombobox players={players} value={a} onChange={setA} excludeIds={[Number(b), Number(a2), Number(b2), ...roundExcludeIds].filter(Boolean)} /></Field>
                    {mode === "doi" && <Field label="Đội A — VĐV 2"><PlayerCombobox players={players} value={a2} onChange={setA2} excludeIds={[Number(a), Number(b), Number(b2), ...roundExcludeIds].filter(Boolean)} /></Field>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Field label={mode === "doi" ? "Đội B — VĐV 1" : "VĐV B"}><PlayerCombobox players={players} value={b} onChange={setB} excludeIds={[Number(a), Number(a2), Number(b2), ...roundExcludeIds].filter(Boolean)} /></Field>
                    {mode === "doi" && <Field label="Đội B — VĐV 2"><PlayerCombobox players={players} value={b2} onChange={setB2} excludeIds={[Number(a), Number(a2), Number(b), ...roundExcludeIds].filter(Boolean)} /></Field>}
                  </div>
                </div>

                <Field label="Trạng thái trận đấu">
                  <div className="flex gap-4" style={{ fontSize: 14 }}>
                    <label className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
                      <input type="radio" name="slot-status" checked={!scheduled} onChange={() => setStatus("completed")} /> Kết thúc
                    </label>
                    <label className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
                      <input type="radio" name="slot-status" checked={scheduled} onChange={() => setStatus("scheduled")} /> Sắp diễn ra
                    </label>
                  </div>
                </Field>

                {!scheduled && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                    <Field label="Số ván thắng — bên A"><input type="number" min="0" style={inputStyle} value={setsA} onChange={(e) => setSetsA(e.target.value)} /></Field>
                    <Field label="Số ván thắng — bên B"><input type="number" min="0" style={inputStyle} value={setsB} onChange={(e) => setSetsB(e.target.value)} /></Field>
                  </div>
                )}

                <HandicapFields
                  tournamentType={tournamentType} mode={mode} pA={pA} pB={pB}
                  handicapA={handicapA} handicapB={handicapB} setHandicapA={setHandicapA} setHandicapB={setHandicapB}
                  rules={handicapRules}
                />
              </>
            )}

            {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}

            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <button type="submit" style={btnPrimary} disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button>
              {canClear && (existingMatch || isBye) && (
                <button type="button" style={{ ...btnGhost, color: C.bad, borderColor: C.bad + "55" }} onClick={doClear} disabled={busy}>Bỏ trống ô này</button>
              )}
              <button type="button" style={btnGhost} onClick={onClose}>Hủy</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

/* ---------- Tab "Vòng loại trực tiếp" (sơ đồ nhánh đấu) ---------- */
function KnockoutPanel({
  tournament, data, canGenerateBracket, canEnterMatch, canEditMatches,
  onAddMatch, onEditMatch, onDeleteMatch,
  onGenerateBracket, onDeleteBracket, onRenameKnockoutRound, onSetSlotBye, onSetSlotMatch, onClearSlot,
}) {
  const legacyMatches = data.matches.filter((m) => m.tournament === tournament.id && m.stage && m.stage !== "bang");
  const slots = (data.knockoutSlots || []).filter((s) => s.tournament === tournament.id);
  const [fillSlotId, setFillSlotId] = useState(null);
  const [renamingRound, setRenamingRound] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  if (slots.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div style={{ fontWeight: 700, fontSize: 15 }}>Vòng loại trực tiếp</div>
        {canGenerateBracket && <GenerateBracketForm onGenerate={(size) => onGenerateBracket(tournament.id, size)} />}
        {legacyMatches.length > 0 ? (
          <LegacyKnockoutView matches={legacyMatches} data={data} canEditMatches={canEditMatches} canAddMedia={canEnterMatch} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch} />
        ) : (
          !canGenerateBracket && <EmptyState text="Giải đấu này chưa có sơ đồ vòng loại trực tiếp." />
        )}
      </div>
    );
  }

  const rounds = [...new Set(slots.map((s) => s.round_no))].sort((x, y) => x - y);
  const slotsOf = (r) => slots.filter((s) => s.round_no === r).sort((x, y) => x.slot_index - y.slot_index);
  const finalRound = rounds[rounds.length - 1];
  const finalSlot = slotsOf(finalRound)[0];
  const champion = finalSlot?.winner_name ? [finalSlot.winner_name, finalSlot.winner_name2].filter(Boolean) : [];
  const managedMatches = slots.filter((s) => s.match).map((s) => ({ ...s.match, __stage: s.stage_name }));
  const fillSlot = slots.find((s) => s.id === fillSlotId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Sơ đồ vòng loại trực tiếp</div>
        {canEditMatches && (
          <button
            type="button" style={{ ...btnGhost, color: C.bad, borderColor: C.bad + "55" }}
            onClick={async () => {
              if (!window.confirm(`Xóa toàn bộ sơ đồ của giải "${tournament.name}"?\n\nMọi trận đã nhập trong sơ đồ sẽ bị xóa, điểm Elo liên quan sẽ được hoàn tác. Hành động này không thể hoàn tác.`)) return;
              await onDeleteBracket(tournament.id);
            }}
          >
            Xóa sơ đồ
          </button>
        )}
      </div>

      {champion.length > 0 && (
        <div style={{ background: C.accent + "12", border: `1px solid ${C.accent}40`, borderRadius: 14, padding: "12px 16px" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.4 }}>Nhà vô địch</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, fontFamily: FONT_DISPLAY }}>{champion.join(" & ")}</div>
        </div>
      )}

      <div className="tt-bracket">
        {rounds.map((r) => (
          <div key={r} className="tt-bracket-col">
            <div className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: r === finalRound ? C.accent : C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {slotsOf(r)[0]?.stage_name}
              </div>
              {canEditMatches && renamingRound !== r && (
                <button
                  type="button" aria-label="Đổi tên vòng"
                  onClick={() => { setRenamingRound(r); setRenameValue(slotsOf(r)[0]?.stage_name || ""); }}
                  style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12, padding: 2 }}
                >
                  ✎
                </button>
              )}
            </div>
            {renamingRound === r && (
              <form
                className="flex gap-1.5" style={{ marginBottom: 6 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!renameValue.trim()) return;
                  await onRenameKnockoutRound(tournament.id, r, renameValue.trim());
                  setRenamingRound(null);
                }}
              >
                <input style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={30} autoFocus />
                <button type="submit" style={{ ...btnPrimary, padding: "6px 10px", fontSize: 12 }}>Lưu</button>
                <button type="button" style={{ ...btnGhost, padding: "6px 10px", fontSize: 12 }} onClick={() => setRenamingRound(null)}>✕</button>
              </form>
            )}
            <div className="flex flex-col gap-2">
              {slotsOf(r).map((slot) => (
                <KnockoutSlotCard
                  key={slot.id} slot={slot} allSlots={slots} players={data.players}
                  canFill={canEnterMatch} canOverride={canEditMatches}
                  onOpenFill={() => setFillSlotId(slot.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {fillSlot && (
        <SlotFillModal
          slot={fillSlot}
          players={data.players}
          tournamentType={tournament.type}
          handicapRules={data.handicapRules}
          suggested={(() => {
            if (fillSlot.round_no === 1) return null;
            const fa = slots.find((s) => s.round_no === fillSlot.round_no - 1 && s.slot_index === fillSlot.slot_index * 2);
            const fb = slots.find((s) => s.round_no === fillSlot.round_no - 1 && s.slot_index === fillSlot.slot_index * 2 + 1);
            return { aId: fa?.winner_player_id, a2Id: fa?.winner_player2_id, bId: fb?.winner_player_id, b2Id: fb?.winner_player2_id };
          })()}
          excludeIds={slots
            .filter((s) => s.round_no === fillSlot.round_no && s.id !== fillSlot.id)
            .flatMap((s) => (s.match ? [s.match.player_a, s.match.player_a2, s.match.player_b, s.match.player_b2] : [s.bye_player, s.bye_player2]))
            .filter(Boolean)}
          onClose={() => setFillSlotId(null)}
          onSetBye={onSetSlotBye} onSetMatch={onSetSlotMatch} onClear={onClearSlot}
          canClear={canEditMatches}
        />
      )}

      {canEditMatches && managedMatches.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>Quản lý trận (sửa / xóa)</div>
          <div className="tt-matchlist" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "6px 16px" }}>
            {managedMatches.sort((x, y) => x.id - y.id).map((m) => (
              <MatchRow
                key={m.id} match={m} data={data} canManage canAddMedia={canEnterMatch} onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch}
                showDate={false} stageBadge={{ text: m.__stage, color: C.accent }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Tab "Thành tích" (đã chuyển từ thẻ giải đấu vào popup) ---------- */
function TournamentResultsPanel({ tournament: t, data, canEnterResults, onAddResult, onEditResult, onDeleteResult }) {
  const results = data.results.filter((r) => r.tournament === t.id);
  const [contentType, setContentType] = useState("don");
  const [placement, setPlacement] = useState("vo_dich");
  const [playerId, setPlayerId] = useState("");
  const [teammateIds, setTeammateIds] = useState([]);
  const [resultError, setResultError] = useState("");

  async function submitResult(saveOnly) {
    setResultError("");
    if (!playerId) return;
    const cleanTeammates = teammateIds.map(Number).filter(Boolean);
    if (contentType === "doi" && cleanTeammates.length !== 1) { setResultError("Nội dung Đôi cần đúng 1 đồng đội."); return; }
    if (contentType === "dong_doi" && cleanTeammates.length < 1) { setResultError("Nội dung Đồng đội cần ít nhất 1 đồng đội."); return; }
    try {
      await onAddResult({ tournamentId: t.id, contentType, playerId: Number(playerId), teammateIds: cleanTeammates, placement, saveOnly });
      setPlayerId(""); setTeammateIds([]);
    } catch (err) {
      setResultError(err.message || "Có lỗi khi lưu thành tích.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div style={{ fontWeight: 700, fontSize: 15 }}>Thành tích ({results.length})</div>
      {results.length === 0 ? (
        <div style={{ fontSize: 13, color: C.muted }}>Chưa có thành tích nào được ghi nhận.</div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "6px 16px" }}>
          {results.map((r) => (
            <ResultRow key={r.id} result={r} players={data.players} canManage={canEnterResults} onEdit={onEditResult} onDelete={onDeleteResult} />
          ))}
        </div>
      )}

      {canEnterResults && (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }} className="flex flex-col gap-2">
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted }}>Thêm thành tích</div>
          <div className="flex gap-2">
            {["don", "doi", "dong_doi"].map((ct) => (
              <button key={ct} type="button" onClick={() => { setContentType(ct); setTeammateIds([]); }} style={{ ...(contentType === ct ? btnPrimary : btnGhost), padding: "6px 12px", fontSize: 12.5 }}>
                {CONTENT_LABEL[ct]}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
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
          </div>
          {contentType !== "don" && (
            <TeammatesPicker contentType={contentType} players={data.players} mainPlayerId={playerId} teammateIds={teammateIds} setTeammateIds={setTeammateIds} />
          )}
          {resultError && <div style={{ color: C.bad, fontSize: 13 }}>{resultError}</div>}
          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            <button type="button" style={btnPrimary} onClick={() => submitResult(false)}>+ Cộng điểm thưởng</button>
            <button type="button" style={btnGhost} onClick={() => submitResult(true)}>Lưu thành tích</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Popup "Danh sách chờ" — nút riêng ngoài thẻ giải đấu, AI CŨNG XEM ĐƯỢC (kể cả chưa đăng
   nhập); tính năng thêm/sửa/xóa chỉ hiện khi canManage (Admin/Quản lý giải). Độc lập hoàn toàn với
   Bảng đấu/Vòng loại trực tiếp: đây chỉ là bước đăng ký/duyệt, xác nhận ở đây KHÔNG tự thêm vào bảng
   nào — Admin vẫn tự tay xếp VĐV đã duyệt vào Bảng đấu/Vòng loại như quy trình hiện có. ---------- */
function TournamentWaitlistModal({ tournament: t, players, canManage, onFetch, onAdd, onEdit, onDelete, onClose }) {
  const [entries, setEntries] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [addPlayerId, setAddPlayerId] = useState("");
  const [addErr, setAddErr] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editPlayerId, setEditPlayerId] = useState("");
  const [editStatus, setEditStatus] = useState("cho");
  const [editErr, setEditErr] = useState("");

  async function load() {
    try {
      const list = await onFetch(t.id);
      setEntries(list);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e.message || "Không tải được danh sách chờ.");
    }
  }
  useEffect(() => { load(); }, [t.id]);

  async function addEntry(e) {
    e.preventDefault();
    setAddErr("");
    if (!addPlayerId) return;
    try {
      await onAdd(t.id, Number(addPlayerId));
      setAddPlayerId("");
      await load();
    } catch (err) {
      setAddErr(err.message || "Có lỗi khi thêm vào danh sách chờ.");
    }
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setEditPlayerId(String(entry.player));
    setEditStatus(entry.status);
    setEditErr("");
  }
  function cancelEdit() {
    setEditingId(null);
    setEditErr("");
  }
  async function saveEdit(entryId) {
    setEditErr("");
    try {
      await onEdit(entryId, { player: Number(editPlayerId), status: editStatus });
      setEditingId(null);
      await load();
    } catch (err) {
      setEditErr(err.message || "Có lỗi khi lưu.");
    }
  }
  async function removeEntry(entry) {
    if (!window.confirm(`Xóa "${entry.player_name}" khỏi danh sách chờ?`)) return;
    try {
      await onDelete(entry.id);
      await load();
    } catch (err) {
      alert(err.message || "Có lỗi khi xóa.");
    }
  }

  const existingPlayerIds = (entries || []).map((e) => e.player);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", zIndex: 80, overflowY: "auto", padding: "3vh 10px" }}>
      <div style={{ background: C.bg, borderRadius: 16, maxWidth: 820, margin: "0 auto", padding: "16px 14px 22px" }} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Danh sách chờ</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: FONT_DISPLAY }}>{t.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ ...btnGhost, padding: "6px 14px", flexShrink: 0 }}>✕ Đóng</button>
        </div>

        {loadErr ? (
          <EmptyState text={loadErr} />
        ) : entries === null ? null : (
          <>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              Danh sách đăng ký thi đấu của giải (độc lập với Bảng đấu/Vòng loại trực tiếp){canManage ? " — chuyển trạng thái \"Đã xác nhận\" chỉ để duyệt đăng ký, bạn vẫn tự xếp VĐV vào Bảng đấu/Vòng loại như bình thường." : "."}
            </div>

            {canManage && (
              <>
                <form onSubmit={addEntry} className="flex items-end gap-3" style={{ flexWrap: "wrap" }}>
                  <Field label="Thêm VĐV vào danh sách chờ">
                    <div style={{ minWidth: 240 }}>
                      <PlayerCombobox players={players} value={addPlayerId} onChange={setAddPlayerId} excludeIds={existingPlayerIds} />
                    </div>
                  </Field>
                  <button type="submit" style={btnPrimary} disabled={!addPlayerId}>+ Thêm</button>
                </form>
                {addErr && <div style={{ color: C.bad, fontSize: 13 }}>{addErr}</div>}
              </>
            )}

            {entries.length === 0 ? (
              <EmptyState text="Chưa có ai đăng ký/được thêm vào danh sách chờ." />
            ) : (
              <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "0 16px", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "8px" }}>STT</th>
                      <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "8px" }}>Ngày đăng ký</th>
                      <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "8px" }}>VĐV</th>
                      <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "8px" }}>Trạng thái</th>
                      <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "8px" }}>Ghi chú</th>
                      {canManage && <th style={{ padding: "8px" }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => {
                      const isEditing = canManage && editingId === entry.id;
                      return (
                        <tr key={entry.id} style={{ borderTop: `1px solid ${C.line}` }}>
                          <td className="tabular" style={{ padding: "8px", fontSize: 13, color: C.muted }}>{idx + 1}</td>
                          <td className="tabular" style={{ padding: "8px", fontSize: 13, whiteSpace: "nowrap" }}>
                            {fmtDate((entry.created_at || "").slice(0, 10))}
                          </td>
                          <td style={{ padding: "8px", fontSize: 13.5, minWidth: 180 }}>
                            {isEditing ? (
                              <PlayerCombobox players={players} value={editPlayerId} onChange={setEditPlayerId} excludeIds={existingPlayerIds.filter((id) => id !== entry.player)} />
                            ) : entry.player_name}
                          </td>
                          <td style={{ padding: "8px", fontSize: 13 }}>
                            {isEditing ? (
                              <select style={{ ...inputStyle, maxWidth: 160 }} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                                <option value="cho">Chờ</option>
                                <option value="xac_nhan">Đã xác nhận</option>
                              </select>
                            ) : (
                              <span style={{
                                fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                                background: entry.status === "xac_nhan" ? "#1E8E5222" : "#F2A93B22",
                                color: entry.status === "xac_nhan" ? "#1E8E52" : "#B9790A",
                              }}>
                                {entry.status === "xac_nhan" ? "Đã xác nhận" : "Chờ"}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "8px", fontSize: 13 }}>
                            {entry.source === "self" ? "VĐV tự đăng ký" : "-"}
                          </td>
                          {canManage && (
                            <td style={{ padding: "8px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {isEditing ? (
                                <>
                                  <button type="button" style={{ ...btnPrimary, padding: "4px 10px", fontSize: 12.5 }} onClick={() => saveEdit(entry.id)}>Lưu</button>{" "}
                                  <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12.5 }} onClick={cancelEdit}>Hủy</button>
                                </>
                              ) : (
                                <>
                                  <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12.5 }} onClick={() => startEdit(entry)}>Sửa</button>{" "}
                                  <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12.5, color: C.bad }} onClick={() => removeEntry(entry)}>Xóa</button>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {editErr && <div style={{ color: C.bad, fontSize: 13, padding: "8px" }}>{editErr}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Popup "Đăng ký thi đấu" — mở từ menu góc user, chỉ cho tài khoản đã liên kết VĐV. 2 tab:
   "Giải đấu" (đăng ký vào Danh sách chờ của giải đang Mở đăng ký) và "Giao hữu" (tự tạo 1 trận Giao
   hữu ở trạng thái "Chờ xác nhận", chờ đối thủ chính xác nhận). ---------- */
function SelfRegisterModal({ currentUser, tournaments, players, handicapRules, onFetchWaitlist, onAddWaitlistEntry, onSelfRegisterMatch, onClose }) {
  const [tab, setTab] = useState("giai_dau");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", zIndex: 80, overflowY: "auto", padding: "3vh 10px" }}>
      <div style={{ background: C.bg, borderRadius: 16, maxWidth: 680, margin: "0 auto", padding: "16px 14px 22px" }} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Đăng ký thi đấu</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: FONT_DISPLAY }}>{tab === "giai_dau" ? "Đăng ký Giải đấu" : "Đăng ký Giao hữu"}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ ...btnGhost, padding: "6px 14px", flexShrink: 0 }}>✕ Đóng</button>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("giai_dau")} style={tab === "giai_dau" ? btnPrimary : btnGhost}>Giải đấu</button>
          <button type="button" onClick={() => setTab("giao_huu")} style={tab === "giao_huu" ? btnPrimary : btnGhost}>Giao hữu</button>
        </div>

        {tab === "giai_dau" ? (
          <TournamentRegisterPane currentUser={currentUser} tournaments={tournaments} onFetchWaitlist={onFetchWaitlist} onAddWaitlistEntry={onAddWaitlistEntry} />
        ) : (
          <FriendlyRegisterPane currentUser={currentUser} players={players} handicapRules={handicapRules} onSelfRegisterMatch={onSelfRegisterMatch} />
        )}
      </div>
    </div>
  );
}

/* ---------- Tab "Giải đấu" của popup Đăng ký thi đấu — chỉ liệt kê giải đang "Mở đăng ký" và chưa
   "Đã kết thúc"; VĐV chỉ đăng ký được cho chính mình, đăng ký thành công vào thẳng Danh sách chờ
   với trạng thái "Chờ". ---------- */
function TournamentRegisterPane({ currentUser, tournaments, onFetchWaitlist, onAddWaitlistEntry }) {
  const openTournaments = useMemo(
    () => tournaments.filter((t) => t.registration_status === "mo_dang_ky" && t.status !== "da_ket_thuc"),
    [tournaments]
  );
  const [myStatus, setMyStatus] = useState({}); // { [tournamentId]: "cho" | "xac_nhan" | undefined }
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [registeringId, setRegisteringId] = useState(null);
  const [err, setErr] = useState("");

  async function loadMyStatus() {
    setLoading(true);
    setLoadErr("");
    try {
      const results = await Promise.all(
        openTournaments.map((t) => onFetchWaitlist(t.id).then((list) => [t.id, list]))
      );
      const next = {};
      for (const [tid, list] of results) {
        const mine = (list || []).find((e) => e.player === currentUser.player_id);
        if (mine) next[tid] = mine.status;
      }
      setMyStatus(next);
    } catch (e) {
      setLoadErr(e.message || "Không tải được tình trạng đăng ký.");
    }
    setLoading(false);
  }
  useEffect(() => { loadMyStatus(); }, [openTournaments.map((t) => t.id).join(",")]);

  async function register(t) {
    setErr("");
    setRegisteringId(t.id);
    try {
      await onAddWaitlistEntry(t.id, currentUser.player_id);
      setMyStatus((prev) => ({ ...prev, [t.id]: "cho" }));
    } catch (e) {
      setErr(e.message || "Có lỗi khi đăng ký.");
    }
    setRegisteringId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
        Đăng ký tham gia các giải đấu đang mở đăng ký — đăng ký thành công sẽ vào Danh sách chờ với trạng thái "Chờ", Admin/Quản lý giải sẽ duyệt và xếp bạn vào bảng đấu.
      </div>

      {err && <div style={{ color: C.bad, fontSize: 13 }}>{err}</div>}

      {loadErr ? (
        <EmptyState text={loadErr} />
      ) : openTournaments.length === 0 ? (
        <EmptyState text="Hiện không có giải đấu nào đang mở đăng ký." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {openTournaments.map((t) => {
            const status = myStatus[t.id];
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3"
                style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{tournamentDateRangeText(t)}</div>
                </div>
                {loading ? (
                  <div style={{ fontSize: 12.5, color: C.muted, flexShrink: 0 }}>Đang tải…</div>
                ) : status ? (
                  <span style={{
                    flexShrink: 0, fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                    background: status === "xac_nhan" ? "#1E8E5222" : "#F2A93B22",
                    color: status === "xac_nhan" ? "#1E8E52" : "#B9790A",
                  }}>
                    {status === "xac_nhan" ? "Đã xác nhận" : "Đã đăng ký · Chờ"}
                  </span>
                ) : (
                  <button
                    type="button" style={{ ...btnPrimary, padding: "6px 14px", fontSize: 13, flexShrink: 0 }}
                    disabled={registeringId === t.id}
                    onClick={() => register(t)}
                  >
                    {registeringId === t.id ? "Đang đăng ký…" : "Đăng ký"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Tab "Giao hữu" của popup Đăng ký thi đấu — VĐV tự tạo 1 trận Giao hữu (Đơn/Đôi), chọn
   đối thủ chính (người PHẢI xác nhận), chấp điểm (có check đề xuất giống form nhập trận), ngày diễn
   ra không được là ngày quá khứ. Tạo xong trận ở trạng thái "Chờ xác nhận", hiện trong menu Giao hữu. */
function FriendlyRegisterPane({ currentUser, players, handicapRules, onSelfRegisterMatch }) {
  const me = players.find((p) => p.id === currentUser.player_id);
  const [mode, setMode] = useState("don");
  const [opponentId, setOpponentId] = useState("");
  const [teammateId, setTeammateId] = useState("");
  const [opponent2Id, setOpponent2Id] = useState("");
  const [date, setDate] = useState(todayStr());
  const [handicapA, setHandicapA] = useState("");
  const [handicapB, setHandicapB] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const otherPlayers = useMemo(() => players.filter((p) => p.id !== currentUser.player_id), [players, currentUser]);
  const pB = players.find((p) => p.id === Number(opponentId));

  function resetForm() {
    setOpponentId(""); setTeammateId(""); setOpponent2Id(""); setHandicapA(""); setHandicapB("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!opponentId) { setErr("Hãy chọn đối thủ."); return; }
    if (date < todayStr()) { setErr("Không thể chọn ngày trong quá khứ."); return; }
    if (handicapA.trim() && !HANDICAP_FORMAT_RE.test(handicapA.trim())) { setErr("Điểm chấp VĐV A không đúng định dạng (VD: 2-0-2)."); return; }
    if (handicapB.trim() && !HANDICAP_FORMAT_RE.test(handicapB.trim())) { setErr("Điểm chấp VĐV B không đúng định dạng (VD: 2-0-2)."); return; }
    const payload = {
      mode, opponent: Number(opponentId), date,
      handicap_a: handicapA.trim(), handicap_b: handicapB.trim(),
    };
    if (mode === "doi") {
      if (!teammateId || !opponent2Id) { setErr("Đánh đôi cần chọn đủ đồng đội của bạn và đối thủ thứ 2."); return; }
      const ids = new Set([currentUser.player_id, Number(teammateId), Number(opponentId), Number(opponent2Id)]);
      if (ids.size !== 4) { setErr("4 VĐV trong trận đôi phải khác nhau."); return; }
      payload.teammate = Number(teammateId);
      payload.opponent2 = Number(opponent2Id);
    }
    setBusy(true);
    try {
      await onSelfRegisterMatch(payload);
      setMsg(`Đã đăng ký trận gặp ${pB?.name || "đối thủ"}, đang chờ xác nhận.`);
      resetForm();
      setTimeout(() => setMsg(""), 4000);
    } catch (e2) {
      setErr(e2.message || "Có lỗi khi đăng ký.");
    }
    setBusy(false);
  }

  if (!me) return <EmptyState text="Tài khoản của bạn chưa được gắn với VĐV nào." />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
        Đăng ký 1 trận Giao hữu — trận sẽ ở trạng thái "Chờ xác nhận" cho tới khi đối thủ chính xác nhận. Bạn luôn là VĐV A.
      </div>

      <Field label="Thể thức">
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("don")} style={mode === "don" ? btnPrimary : btnGhost}>Đánh đơn</button>
          <button type="button" onClick={() => setMode("doi")} style={mode === "doi" ? btnPrimary : btnGhost}>Đánh đôi</button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Field label={mode === "doi" ? "Đội của bạn — đồng đội" : "Bạn"}>
            {mode === "doi" ? (
              <PlayerCombobox players={otherPlayers.filter((p) => p.id !== Number(opponentId) && p.id !== Number(opponent2Id))} value={teammateId} onChange={setTeammateId} placeholder="— chọn đồng đội —" />
            ) : (
              <input style={{ ...inputStyle, background: C.bg }} value={me.name} disabled />
            )}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <Field label="Đối thủ chính (cần xác nhận)">
            <PlayerCombobox players={otherPlayers.filter((p) => p.id !== Number(teammateId) && p.id !== Number(opponent2Id))} value={opponentId} onChange={setOpponentId} placeholder="— chọn đối thủ —" />
          </Field>
          {mode === "doi" && (
            <Field label="Đối thủ thứ 2 (không cần xác nhận)">
              <PlayerCombobox players={otherPlayers.filter((p) => p.id !== Number(teammateId) && p.id !== Number(opponentId))} value={opponent2Id} onChange={setOpponent2Id} placeholder="— chọn đối thủ thứ 2 —" />
            </Field>
          )}
        </div>
      </div>

      <HandicapFields
        tournamentType="giao_huu" mode={mode} pA={me} pB={pB}
        handicapA={handicapA} handicapB={handicapB} setHandicapA={setHandicapA} setHandicapB={setHandicapB}
        rules={handicapRules}
      />

      <Field label="Ngày diễn ra">
        <input type="date" style={inputStyle} min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>

      {err && <div style={{ color: C.bad, fontSize: 13 }}>{err}</div>}
      {msg && <div style={{ color: "#1E8E52", fontSize: 13, fontWeight: 600 }}>{msg}</div>}

      <button type="submit" style={btnPrimary} disabled={busy}>{busy ? "Đang đăng ký…" : "Đăng ký"}</button>
    </form>
  );
}

/* ---------- Popup thông báo "Bạn có trận đấu chờ xác nhận" — hiện khi currentUser (qua VĐV liên
   kết) là đối thủ chính (player_b) của 1 trận Giao hữu người khác vừa đăng ký. Hủy = chỉ đóng popup,
   không có gì xảy ra (sẽ không hiện lại cho ĐÚNG trận này trong phiên hiện tại). ---------- */
function FriendlyPendingNoticeModal({ opponentName, onConfirmOpen, onDismiss }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, borderRadius: 16, maxWidth: 380, width: "100%", padding: 22 }} className="flex flex-col gap-3">
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Bạn có trận đấu chờ xác nhận</div>
        <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6 }}>
          <strong style={{ color: C.ink }}>{opponentName}</strong> vừa mời bạn 1 trận Giao hữu — hãy xác nhận hoặc từ chối.
        </div>
        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button type="button" style={btnPrimary} onClick={onConfirmOpen}>Xác nhận</button>
          <button type="button" style={btnGhost} onClick={onDismiss}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Popup "Xác nhận trận Giao hữu" — mở sau khi bấm "Xác nhận" ở popup thông báo. Chỉ VĐV
   được mời (player_b) mới thấy/bấm được 2 nút này (phía BE cũng tự kiểm tra lại). ---------- */
function FriendlyConfirmModal({ match: m, players, onConfirm, onReject, onClose }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isDoubles = m.mode === "doi";
  const pA = players.find((p) => p.id === m.player_a);
  const pA2 = isDoubles ? players.find((p) => p.id === m.player_a2) : null;
  const pB = players.find((p) => p.id === m.player_b);
  const pB2 = isDoubles ? players.find((p) => p.id === m.player_b2) : null;
  const labelA = isDoubles ? `${pA?.name} & ${pA2?.name}` : pA?.name;
  const labelB = isDoubles ? `${pB?.name} & ${pB2?.name}` : pB?.name;

  async function act(fn) {
    setErr(""); setBusy(true);
    try { await fn(); onClose(); }
    catch (e) { setErr(e.message || "Có lỗi, vui lòng thử lại."); setBusy(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, borderRadius: 16, maxWidth: 420, width: "100%", padding: 22 }} className="flex flex-col gap-3">
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Xác nhận trận Giao hữu</div>
        <div style={{ background: C.bg, borderRadius: 10, padding: "12px 14px" }} className="flex flex-col gap-1.5">
          <div style={{ fontSize: 14, fontWeight: 700 }}>{labelA} <span style={{ color: C.muted, fontWeight: 500 }}>vs</span> {labelB}</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>{isDoubles ? "Đánh đôi" : "Đánh đơn"} · {fmtDate(m.date)}</div>
          {(m.handicap_a || m.handicap_b) && (
            <div style={{ fontSize: 12.5, color: C.muted }}>Điểm chấp: {m.handicap_a ? `${labelA} +${m.handicap_a}` : `${labelB} +${m.handicap_b}`}</div>
          )}
        </div>
        {err && <div style={{ color: C.bad, fontSize: 13 }}>{err}</div>}
        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => act(onConfirm)}>Xác nhận</button>
          <button type="button" style={{ ...btnGhost, color: C.bad, borderColor: C.bad + "55" }} disabled={busy} onClick={() => act(onReject)}>Từ chối</button>
          <button type="button" style={btnGhost} disabled={busy} onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Popup "Quản lý giải đấu" ---------- */
function TournamentManageModal({ tournament: t, data, perms, handlers, onClose }) {
  const [tab, setTab] = useState("groups");
  const isOpen = t.status !== "da_ket_thuc";
  const statusMeta = tournamentStatusMeta(t);
  const tabs = [
    { id: "groups", label: "Bảng đấu" },
    { id: "knockout", label: "Vòng loại trực tiếp" },
    { id: "results", label: "Thành tích" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", zIndex: 70, overflowY: "auto", padding: "3vh 10px" }}>
      <div style={{ background: C.bg, borderRadius: 16, maxWidth: 1100, margin: "0 auto", padding: "16px 14px 22px" }} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {perms.canManage ? "Quản lý giải đấu" : "Chi tiết giải đấu"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, overflowWrap: "anywhere" }}>{t.name}</div>
            <div className="flex items-center gap-2" style={{ marginTop: 4, flexWrap: "wrap" }}>
              <TypeTag type={t.type} />
              <span style={{ fontSize: 12.5, color: C.muted }}>{tournamentDateRangeText(t)}</span>
              <span style={{ fontSize: 12.5, color: statusMeta.color, fontWeight: 600 }}>{statusMeta.label}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ ...btnGhost, padding: "6px 14px", flexShrink: 0 }}>✕ Đóng</button>
        </div>

        <div className="flex gap-2" style={{ overflowX: "auto", paddingBottom: 2 }}>
          {tabs.map((tb) => (
            <button
              key={tb.id} type="button" onClick={() => setTab(tb.id)}
              style={{ ...(tab === tb.id ? btnPrimary : btnGhost), padding: "8px 16px", fontSize: 13.5, whiteSpace: "nowrap" }}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {!isOpen && perms.canEnterMatches && tab !== "results" && (
          <div style={{ fontSize: 12.5, color: C.muted }}>Giải đấu đã kết thúc — không thể nhập thêm trận mới (vẫn có thể xem/sửa các trận đã có).</div>
        )}

        {tab === "groups" && (
          <GroupsPanel
            tournament={t} data={data}
            canManageGroups={perms.canEnterResults && isOpen} canEnterMatch={perms.canEnterMatches && isOpen} canEditMatches={perms.canManageMatches}
            onAddGroup={handlers.onAddGroup} onUpdateGroup={handlers.onUpdateGroup} onDeleteGroup={handlers.onDeleteGroup}
            onAddMatch={handlers.onAddMatch} onEditMatch={handlers.onEditMatch} onDeleteMatch={handlers.onDeleteMatch}
          />
        )}
        {tab === "knockout" && (
          <KnockoutPanel
            tournament={t} data={data}
            canGenerateBracket={perms.canEnterResults} canEnterMatch={perms.canEnterMatches && isOpen} canEditMatches={perms.canManageMatches}
            onAddMatch={handlers.onAddMatch} onEditMatch={handlers.onEditMatch} onDeleteMatch={handlers.onDeleteMatch}
            onGenerateBracket={handlers.onGenerateBracket} onDeleteBracket={handlers.onDeleteBracket} onRenameKnockoutRound={handlers.onRenameKnockoutRound}
            onSetSlotBye={handlers.onSetSlotBye} onSetSlotMatch={handlers.onSetSlotMatch} onClearSlot={handlers.onClearSlot}
          />
        )}
        {tab === "results" && (
          <TournamentResultsPanel
            tournament={t} data={data} canEnterResults={perms.canEnterResults}
            onAddResult={handlers.onAddResult} onEditResult={handlers.onEditResult} onDeleteResult={handlers.onDeleteResult}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Thẻ giải đấu (gọn): thông tin + nút mở popup ---------- */
function TournamentCard({
  tournament: t, data, expanded, onToggle, canEnterResults, canEnterMatches, canManageMatches, canDeleteTournament,
  onEditTournament, onDeleteTournament, onAddResult, onEditResult, onDeleteResult, onAddMatch, onEditMatch, onDeleteMatch,
  onAddGroup, onUpdateGroup, onDeleteGroup, onGenerateBracket, onDeleteBracket, onRenameKnockoutRound,
  onSetSlotBye, onSetSlotMatch, onClearSlot,
  onSetTournamentRegistration, onFetchWaitlist, onAddWaitlistEntry, onUpdateWaitlistEntry, onDeleteWaitlistEntry,
}) {
  const [showManage, setShowManage] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const matches = data.matches.filter((m) => m.tournament === t.id);
  const results = data.results.filter((r) => r.tournament === t.id);
  const groups = (data.groups || []).filter((g) => g.tournament === t.id);
  const champions = results
    .filter((r) => r.placement === "vo_dich")
    .map((r) => namesOf([r.player, ...(r.teammates || [])], data.players).join(" & "))
    .filter(Boolean);
  const canManage = canEnterResults || canEnterMatches;
  const accentColor = t.type === "khong_chap" ? C.accent : "#1E8E52";
  const statusMeta = tournamentStatusMeta(t);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderLeft: `4px solid ${accentColor}`, borderRadius: 10 }}>
      <div onClick={onToggle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", cursor: "pointer" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{t.name}</div>
          <div className="flex items-center gap-2" style={{ marginTop: 4, flexWrap: "wrap" }}>
            <TypeTag type={t.type} />
            <span style={{ fontSize: 12.5, color: C.muted }}>{tournamentDateRangeText(t)}</span>
            <span style={{ fontSize: 12.5, color: statusMeta.color, fontWeight: 600 }}>{statusMeta.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: t.registration_status === "mo_dang_ky" ? "#1E8E5222" : "#6B728022", color: t.registration_status === "mo_dang_ky" ? "#1E8E52" : "#6B7280" }}>
              {t.registration_status === "mo_dang_ky" ? "Mở đăng ký" : "Đóng đăng ký"}
            </span>
          </div>
        </div>
        <span style={{ color: C.muted, fontSize: 13 }}>{expanded ? "Thu gọn ▲" : "Chi tiết ▼"}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: 16 }} className="flex flex-col gap-3">
          <div style={{ fontSize: 13, color: C.muted }}>
            {groups.length} bảng đấu · {matches.length} trận · {results.length} thành tích
            {champions.length > 0 && <> · Vô địch: <b style={{ color: C.nameColor }}>{champions.join(", ")}</b></>}
          </div>

          <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
            <button style={btnPrimary} onClick={() => setShowManage(true)}>{canManage ? "Quản lý giải đấu" : "Xem chi tiết giải"}</button>
            <button style={btnGhost} onClick={() => setShowWaitlist(true)}>Danh sách chờ</button>
            {canEnterResults && (
              <button
                style={btnGhost}
                onClick={() => onSetTournamentRegistration(t.id, t.registration_status === "mo_dang_ky" ? "dong_dang_ky" : "mo_dang_ky")}
              >
                {t.registration_status === "mo_dang_ky" ? "Đóng đăng ký" : "Mở đăng ký"}
              </button>
            )}
            {canDeleteTournament && (
              <button style={btnGhost} onClick={() => setShowEdit(true)}>Chỉnh sửa</button>
            )}
            {canDeleteTournament && (
              <button
                style={{ ...btnGhost, color: C.bad, borderColor: C.bad + "55" }}
                onClick={async () => {
                  if (!window.confirm(
                    `Xóa vĩnh viễn giải "${t.name}"?\n\nToàn bộ bảng đấu, trận đấu và điểm thưởng thành tích của giải này sẽ bị xóa, điểm của các VĐV liên quan sẽ được hoàn tác về đúng trước khi giải diễn ra. Hành động này không thể hoàn tác.`
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

      {showManage && (
        <TournamentManageModal
          tournament={t} data={data} onClose={() => setShowManage(false)}
          perms={{ canManage, canEnterResults, canEnterMatches, canManageMatches }}
          handlers={{
            onAddGroup, onUpdateGroup, onDeleteGroup, onAddMatch, onEditMatch, onDeleteMatch, onAddResult, onEditResult, onDeleteResult,
            onGenerateBracket, onDeleteBracket, onRenameKnockoutRound, onSetSlotBye, onSetSlotMatch, onClearSlot,
          }}
        />
      )}

      {showWaitlist && (
        <TournamentWaitlistModal
          tournament={t} players={data.players} canManage={canEnterResults}
          onFetch={onFetchWaitlist} onAdd={onAddWaitlistEntry} onEdit={onUpdateWaitlistEntry} onDelete={onDeleteWaitlistEntry}
          onClose={() => setShowWaitlist(false)}
        />
      )}

      {showEdit && (
        <TournamentEditModal
          tournament={t}
          onSave={async (patch) => { await onEditTournament(t.id, patch); setShowEdit(false); }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}

/* ---------- Popup "Chỉnh sửa giải đấu" (quyền Quản trị): Tên giải, ngày diễn ra, Loại giải ---------- */
function TournamentEditModal({ tournament: t, onSave, onClose }) {
  const [name, setName] = useState(t.name);
  const [type, setType] = useState(t.type);
  const [date, setDate] = useState(t.date);
  const [dateTo, setDateTo] = useState(t.effective_date_to || t.date_to || t.date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    const finalDateTo = dateTo && dateTo >= date ? dateTo : date;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), type, date, dateTo: finalDateTo });
    } catch (err) {
      setError(err?.message || "Không thể lưu thay đổi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", zIndex: 80, overflowY: "auto", padding: "3vh 10px" }}>
      <form
        onSubmit={submit}
        style={{ background: C.surface, borderRadius: 16, maxWidth: 480, margin: "0 auto", padding: 20 }}
        className="flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>Chỉnh sửa giải đấu</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: FONT_DISPLAY }}>{t.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ ...btnGhost, padding: "6px 14px", flexShrink: 0 }}>✕</button>
        </div>

        <Field label="Tên giải">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Loại giải">
          <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="khong_chap">Không chấp điểm</option>
            <option value="co_chap">Có chấp điểm</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Từ ngày">
            <input
              type="date" style={inputStyle} value={date}
              onChange={(e) => {
                const v = e.target.value;
                setDate(v);
                if (!dateTo || dateTo < v) setDateTo(v);
              }}
            />
          </Field>
          <Field label="Đến ngày">
            <input type="date" style={inputStyle} value={dateTo} min={date} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted }}>
          Trạng thái giải (Sắp diễn ra / Đang diễn ra / Đã kết thúc) tự tính theo khoảng ngày này so với hôm nay.
        </div>

        {error && <div style={{ color: C.bad, fontSize: 12.5 }}>{error}</div>}

        <div className="flex gap-2">
          <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button>
          <button type="button" style={btnGhost} onClick={onClose}>Huỷ</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Enter match ---------- */
/* ---------- Form nhập trận giao hữu (nằm ngay trong tab Giao hữu — không còn "Bối cảnh",
   mọi trận nhập ở đây luôn là Giao hữu) ---------- */
function FriendlyMatchEntryForm({ players, handicapRules, onAddMatch }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("don");
  const [matchStatus, setMatchStatus] = useState("completed");
  const [friendlyDate, setFriendlyDate] = useState(todayStr());
  const [playerAId, setPlayerAId] = useState("");
  const [playerBId, setPlayerBId] = useState("");
  const [playerA2Id, setPlayerA2Id] = useState("");
  const [playerB2Id, setPlayerB2Id] = useState("");
  const [setsA, setSetsA] = useState(3);
  const [setsB, setSetsB] = useState(0);
  const [handicapA, setHandicapA] = useState("");
  const [handicapB, setHandicapB] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const isScheduled = matchStatus === "scheduled";
  const pA = players.find((p) => p.id === Number(playerAId));
  const pB = players.find((p) => p.id === Number(playerBId));
  const pA2 = players.find((p) => p.id === Number(playerA2Id));
  const pB2 = players.find((p) => p.id === Number(playerB2Id));

  const preview = useMemo(() => {
    if (isScheduled || mode === "doi" || !pA || !pB) return null;
    if (Number(setsA) === Number(setsB)) return null;
    const winner = Number(setsA) > Number(setsB) ? "A" : "B";
    return computeMatchDeltaPreview(pA.rating, pB.rating, winner, "giao_huu");
  }, [isScheduled, mode, pA, pB, setsA, setsB]);

  function resetForm() {
    setPlayerAId(""); setPlayerA2Id(""); setPlayerBId(""); setPlayerB2Id("");
    setSetsA(3); setSetsB(0); setHandicapA(""); setHandicapB("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!isScheduled && Number(setsA) === Number(setsB)) return;
    if (handicapA.trim() && !HANDICAP_FORMAT_RE.test(handicapA.trim())) { setError("Điểm chấp VĐV/Đội A không đúng định dạng (VD: 2-0-2)."); return; }
    if (handicapB.trim() && !HANDICAP_FORMAT_RE.test(handicapB.trim())) { setError("Điểm chấp VĐV/Đội B không đúng định dạng (VD: 2-0-2)."); return; }
    try {
      if (mode === "doi") {
        const ids = [playerAId, playerA2Id, playerBId, playerB2Id];
        if (ids.some((x) => !x) || new Set(ids).size !== 4) return;
        await onAddMatch({
          tournamentId: null, friendlyDate, mode: "doi", status: matchStatus,
          playerAId: Number(playerAId), playerA2Id: Number(playerA2Id),
          playerBId: Number(playerBId), playerB2Id: Number(playerB2Id),
          setsA: isScheduled ? null : Number(setsA), setsB: isScheduled ? null : Number(setsB),
          handicapA: handicapA.trim(), handicapB: handicapB.trim(),
        });
        setMsg(isScheduled
          ? `Đã tạo trận sắp diễn ra: ${pA.name} & ${pA2.name} vs ${pB.name} & ${pB2.name}`
          : `Đã lưu: ${pA.name} & ${pA2.name} ${setsA}–${setsB} ${pB.name} & ${pB2.name}`);
      } else {
        if (!playerAId || !playerBId || playerAId === playerBId) return;
        await onAddMatch({
          tournamentId: null, friendlyDate, status: matchStatus,
          playerAId: Number(playerAId), playerBId: Number(playerBId),
          setsA: isScheduled ? null : Number(setsA), setsB: isScheduled ? null : Number(setsB),
          handicapA: handicapA.trim(), handicapB: handicapB.trim(),
        });
        setMsg(isScheduled
          ? `Đã tạo trận sắp diễn ra: ${pA.name} vs ${pB.name}`
          : `Đã lưu kết quả: ${pA.name} ${setsA}–${setsB} ${pB.name}`);
      }
      resetForm();
      setTimeout(() => setMsg(""), 3000);
    } catch (err) {
      setError(err.message || "Có lỗi khi lưu trận đấu.");
    }
  }

  if (players.length < 2) return <EmptyState text="Cần ít nhất 2 vận động viên để nhập trận đấu." />;

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" style={btnPrimary} onClick={() => setOpen(true)}>+ Nhập trận giao hữu</button>
        {msg && <span style={{ fontSize: 13, color: "#1E8E52", fontWeight: 600 }}>{msg}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Thể thức">
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("don")} style={mode === "don" ? btnPrimary : btnGhost}>Đánh đơn</button>
            <button type="button" onClick={() => setMode("doi")} style={mode === "doi" ? btnPrimary : btnGhost}>Đánh đôi</button>
          </div>
        </Field>
        <Field label="Trạng thái trận đấu">
          <div className="flex gap-4" style={{ fontSize: 14, paddingTop: 8 }}>
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
      </div>

      <Field label="Ngày diễn ra"><input type="date" style={inputStyle} value={friendlyDate} onChange={(e) => setFriendlyDate(e.target.value)} required /></Field>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Field label={mode === "doi" ? "Đội A — VĐV 1" : "VĐV A"}>
            <PlayerCombobox players={players} value={playerAId} onChange={setPlayerAId} />
          </Field>
          {mode === "doi" && (
            <Field label="Đội A — VĐV 2">
              <PlayerCombobox players={players} value={playerA2Id} onChange={setPlayerA2Id} />
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Field label={mode === "doi" ? "Đội B — VĐV 1" : "VĐV B"}>
            <PlayerCombobox players={players} value={playerBId} onChange={setPlayerBId} />
          </Field>
          {mode === "doi" && (
            <Field label="Đội B — VĐV 2">
              <PlayerCombobox players={players} value={playerB2Id} onChange={setPlayerB2Id} />
            </Field>
          )}
        </div>
      </div>

      <HandicapFields
        tournamentType="giao_huu" mode={mode} pA={pA} pB={pB}
        handicapA={handicapA} handicapB={handicapB} setHandicapA={setHandicapA} setHandicapB={setHandicapB}
        rules={handicapRules}
      />

      {isScheduled ? (
        <div style={{ fontSize: 13.5, color: C.muted, background: C.bg, borderRadius: 8, padding: "10px 12px" }}>
          Trận "Sắp diễn ra" chưa cần nhập tỷ số — sẽ hiện trong danh sách Giao hữu, chưa tính điểm. Vào phần Sửa trận để nhập tỷ số khi trận đấu kết thúc.
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
        <button type="submit" style={btnPrimary}>{isScheduled ? "Tạo trận sắp diễn ra" : "Lưu kết quả trận đấu"}</button>
        <button type="button" style={btnGhost} onClick={() => { setOpen(false); setError(""); }}>Đóng form</button>
        {msg && <span style={{ fontSize: 13, color: "#1E8E52", fontWeight: 600 }}>{msg}</span>}
      </div>
    </form>
  );
}

/* ---------- Friendly matches log ---------- */
function FriendlyMatchesTab({ data, canManage, canAddMedia, canAddMatch, onAddMatch, onEditMatch, onDeleteMatch, currentUser, onConfirmMatch, onRejectMatch }) {
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

  return (
    <div className="flex flex-col gap-3">
      {canAddMatch && (
        <FriendlyMatchEntryForm players={data.players} handicapRules={data.handicapRules} onAddMatch={onAddMatch} />
      )}

      {allFriendly.length === 0 ? (
        <EmptyState text="Chưa có trận giao hữu nào." />
      ) : (
        <>
          <Field label="Lọc theo năm">
            <select style={{ ...inputStyle, maxWidth: 200 }} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
              <option value="all">Tất cả</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>

          {friendly.length === 0 ? (
            <EmptyState text={`Không có trận giao hữu nào trong năm ${yearFilter}.`} />
          ) : (
            <div className="tt-matchlist" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "0 16px" }}>
              {friendly.map((m) => (
                <MatchRow
                  key={m.id} match={m} data={data} canManage={canManage} canAddMedia={canAddMedia}
                  onEditMatch={onEditMatch} onDeleteMatch={onDeleteMatch} showDate
                  currentUser={currentUser} onConfirmMatch={onConfirmMatch} onRejectMatch={onRejectMatch}
                />
              ))}
            </div>
          )}
        </>
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
function UserMenu({ currentUser, onLogout, onChangePassword, onOpenProfile, onOpenRegister }) {
  const [open, setOpen] = useState(false);
  const initials = (currentUser.username || "?")[0]?.toUpperCase() || "?";

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
            <button onClick={() => { setOpen(false); onOpenProfile(); }} style={menuBtnStyle}>Hồ sơ</button>
            <button
              onClick={() => { if (!currentUser.player_id) return; setOpen(false); onOpenRegister(); }}
              title={!currentUser.player_id ? "Tài khoản của bạn chưa được gắn với VĐV nào" : undefined}
              style={{ ...menuBtnStyle, ...(currentUser.player_id ? {} : { color: C.muted, cursor: "not-allowed" }) }}
            >
              Đăng ký thi đấu
            </button>
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
  const [needSecurity, setNeedSecurity] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const token = needSecurity ? await getRecaptchaToken("login") : null;
      await onLogin(username, password, token);
      onClose();
    } catch (err) {
      setError(err.message || "Đăng nhập thất bại.");
      if (err.captcha_required) setNeedSecurity(true);
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
        {needSecurity && (
          <div style={{ fontSize: 12, color: C.muted }}>
            Hệ thống đang xác minh bảo mật (reCAPTCHA) do có nhiều lần đăng nhập sai gần đây.
          </div>
        )}
        {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button type="submit" style={btnPrimary} disabled={loading}>{loading ? "Đang đăng nhập…" : "Đăng nhập"}</button>
          <button type="button" style={btnGhost} onClick={onClose}>Huỷ</button>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted }}>
          Trang này được bảo vệ bởi reCAPTCHA. Áp dụng <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" style={{ color: C.muted }}>Chính sách bảo mật</a> và <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" style={{ color: C.muted }}>Điều khoản dịch vụ</a> của Google.
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

/* ---------- Trang Quản lý điểm (chỉ Admin) ---------- */
function RankingConfigTab({ onFetch, onSave, handicapRules, onAddHandicapRule, onEditHandicapRule, onDeleteHandicapRule }) {
  const [subTab, setSubTab] = useState("general");
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await onFetch();
        setCfg(data);
        setForm(data);
      } catch (err) {
        setLoadErr(err.message || "Không tải được cấu hình.");
      }
    })();
  }, []);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaveMsg(""); setSaveErr("");
    try {
      const payload = {
        k_khong_chap: Number(form.k_khong_chap), k_co_chap: Number(form.k_co_chap), k_giao_huu: Number(form.k_giao_huu),
        bonus_vo_dich: Number(form.bonus_vo_dich), bonus_a_quan: Number(form.bonus_a_quan),
        bonus_hang_ba: Number(form.bonus_hang_ba), bonus_tu_ket: Number(form.bonus_tu_ket),
        mult_khong_chap: Number(form.mult_khong_chap), mult_co_chap: Number(form.mult_co_chap),
      };
      const saved = await onSave(payload);
      setCfg(saved); setForm(saved);
      setSaveMsg("Đã lưu cấu hình tính điểm.");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err) {
      setSaveErr(err.message || "Có lỗi khi lưu.");
    }
    setSaving(false);
  }

  const bonusPreview = form ? [
    ["vo_dich", "Vô địch"], ["a_quan", "Á quân"], ["hang_ba", "Hạng Ba"], ["tu_ket", "Tứ kết"],
  ].map(([key, label]) => ({
    label,
    khongChap: Math.round(Number(form[`bonus_${key}`] || 0) * Number(form.mult_khong_chap || 0)),
    coChap: Math.round(Number(form[`bonus_${key}`] || 0) * Number(form.mult_co_chap || 0)),
  })) : [];

  const subTabs = [
    { id: "general", label: "Cấu hình chung" },
    { id: "handicap", label: "Điểm chấp" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" style={{ overflowX: "auto", paddingBottom: 2 }}>
        {subTabs.map((tb) => (
          <button
            key={tb.id} type="button" onClick={() => setSubTab(tb.id)}
            style={{ ...(subTab === tb.id ? btnPrimary : btnGhost), padding: "8px 16px", fontSize: 13.5, whiteSpace: "nowrap" }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {subTab === "handicap" && (
        <HandicapRulesPanel
          rules={handicapRules} onAdd={onAddHandicapRule} onEdit={onEditHandicapRule} onDelete={onDeleteHandicapRule}
        />
      )}

      {subTab === "general" && loadErr && <EmptyState text={loadErr} />}
      {subTab === "general" && form && (
      <>
      {/* Hướng dẫn */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }} className="flex flex-col gap-3">
        <div style={{ fontSize: 17, fontWeight: 700, fontFamily: FONT_DISPLAY }}>Cách CLB tính điểm</div>
        <div className="grid grid-cols-2 gap-3">
          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>1. Trận đánh đơn — tính theo Elo</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              Mỗi VĐV có 1 điểm rating. Khi đấu, hệ thống dự đoán xác suất thắng dựa trên chênh lệch điểm 2 người,
              rồi cộng/trừ điểm theo kết quả thật — thắng "bất ngờ" (chấp điểm thấp hơn) được cộng nhiều hơn thắng "chắc thắng".{" "}
              <span className="tabular" style={{ fontWeight: 700 }}>Mức tăng/giảm = Hệ số K × (Kết quả thật − Kết quả dự đoán)</span>, làm tròn.
              Hệ số K càng cao thì điểm biến động càng mạnh mỗi trận — nên đặt K cao hơn cho giải càng "nghiêm túc".
            </div>
          </div>
          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>2. Trận đánh đôi</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              Chỉ ghi nhận thắng/thua và tỷ số — <b>không</b> cộng/trừ điểm rating cho ai, vì điểm rating là của riêng từng cá nhân.
            </div>
          </div>
          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>3. Điểm thưởng thành tích giải đấu</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              Khi giải kết thúc, VĐV (hoặc cả nhóm nếu thi Đôi/Đồng đội) đạt thứ hạng cao được cộng thêm 1 lần:{" "}
              <span className="tabular" style={{ fontWeight: 700 }}>Điểm thưởng = Điểm thưởng gốc theo hạng × Hệ số nhân theo loại giải</span>, làm tròn.
              Giải Giao hữu không áp dụng điểm thưởng này.
            </div>
          </div>
          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>4. "Lưu thành tích" vs "Cộng điểm thưởng"</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              Ở trang Giải đấu, Admin/Quản lý Giải đấu có thể chỉ <b>lưu lại</b> thành tích (không cộng điểm) — dùng cho các nội dung phụ,
              hoặc <b>cộng điểm thưởng</b> thật theo đúng công thức ở trên.
            </div>
          </div>
        </div>
      </div>

      {/* Form chỉnh cấu hình */}
      <form onSubmit={save} className="flex flex-col gap-4">
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }} className="flex flex-col gap-3">
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Hệ số K (Elo) theo loại giải</div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Không chấp điểm">
              <input type="number" min="1" max="200" style={inputStyle} value={form.k_khong_chap} onChange={(e) => setField("k_khong_chap", e.target.value)} />
            </Field>
            <Field label="Có chấp điểm">
              <input type="number" min="1" max="200" style={inputStyle} value={form.k_co_chap} onChange={(e) => setField("k_co_chap", e.target.value)} />
            </Field>
            <Field label="Giao hữu">
              <input type="number" min="1" max="200" style={inputStyle} value={form.k_giao_huu} onChange={(e) => setField("k_giao_huu", e.target.value)} />
            </Field>
          </div>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }} className="flex flex-col gap-3">
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Điểm thưởng gốc theo thành tích</div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Vô địch">
              <input type="number" min="0" max="1000" style={inputStyle} value={form.bonus_vo_dich} onChange={(e) => setField("bonus_vo_dich", e.target.value)} />
            </Field>
            <Field label="Á quân">
              <input type="number" min="0" max="1000" style={inputStyle} value={form.bonus_a_quan} onChange={(e) => setField("bonus_a_quan", e.target.value)} />
            </Field>
            <Field label="Hạng Ba">
              <input type="number" min="0" max="1000" style={inputStyle} value={form.bonus_hang_ba} onChange={(e) => setField("bonus_hang_ba", e.target.value)} />
            </Field>
            <Field label="Tứ kết">
              <input type="number" min="0" max="1000" style={inputStyle} value={form.bonus_tu_ket} onChange={(e) => setField("bonus_tu_ket", e.target.value)} />
            </Field>
          </div>

          <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 8 }}>Hệ số nhân điểm thưởng theo loại giải</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Không chấp điểm">
              <input type="number" min="0" max="10" step="0.1" style={inputStyle} value={form.mult_khong_chap} onChange={(e) => setField("mult_khong_chap", e.target.value)} />
            </Field>
            <Field label="Có chấp điểm">
              <input type="number" min="0" max="10" step="0.1" style={inputStyle} value={form.mult_co_chap} onChange={(e) => setField("mult_co_chap", e.target.value)} />
            </Field>
          </div>

          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
              Xem trước điểm thưởng thực tế theo giá trị đang nhập
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "4px 8px" }}>Thành tích</th>
                  <th style={{ textAlign: "right", fontSize: 12, color: C.muted, padding: "4px 8px" }}>Không chấp điểm</th>
                  <th style={{ textAlign: "right", fontSize: 12, color: C.muted, padding: "4px 8px" }}>Có chấp điểm</th>
                </tr>
              </thead>
              <tbody>
                {bonusPreview.map((row) => (
                  <tr key={row.label} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: "6px 8px", fontSize: 13 }}>{row.label}</td>
                    <td className="tabular" style={{ padding: "6px 8px", fontSize: 13, textAlign: "right", fontWeight: 700, color: "#1E8E52" }}>+{row.khongChap}</td>
                    <td className="tabular" style={{ padding: "6px 8px", fontSize: 13, textAlign: "right", fontWeight: 700, color: "#1E8E52" }}>+{row.coChap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {saveErr && <div style={{ color: C.bad, fontSize: 13 }}>{saveErr}</div>}
          <div className="flex items-center gap-3">
            <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</button>
            <button type="button" style={btnGhost} onClick={() => setForm(cfg)}>Hoàn tác thay đổi</button>
            {saveMsg && <span style={{ fontSize: 13, color: "#1E8E52", fontWeight: 600 }}>{saveMsg}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted }}>
            Lưu ý: thay đổi ở đây chỉ áp dụng cho các trận đấu/thành tích được ghi nhận SAU khi lưu — không tính lại các trận đã có từ trước.
          </div>
        </div>
      </form>
      </>
      )}
    </div>
  );
}

function HandicapRulesPanel({ rules, onAdd, onEdit, onDelete }) {
  const empty = { minDiff: "", maxDiff: "", handicapText: "" };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const sorted = [...(rules || [])].sort((a, b) => a.min_diff - b.min_diff);

  function startEdit(r) {
    setEditingId(r.id);
    setForm({ minDiff: String(r.min_diff), maxDiff: r.max_diff === null || r.max_diff === undefined ? "" : String(r.max_diff), handicapText: r.handicap_text || "" });
    setErr("");
  }
  function cancelEdit() {
    setEditingId(null);
    setForm(empty);
    setErr("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const minDiff = Number(form.minDiff);
    const maxDiff = form.maxDiff === "" ? null : Number(form.maxDiff);
    const handicapText = (form.handicapText || "").trim();
    if (handicapText && !HANDICAP_FORMAT_RE.test(handicapText)) {
      setErr("Điểm chấp chỉ được nhập dạng số cách nhau bởi dấu gạch ngang, ví dụ: 2-0-2. Để trống nếu khoảng này không chấp.");
      setBusy(false);
      return;
    }
    try {
      if (editingId) await onEdit(editingId, { minDiff, maxDiff, handicapText });
      else await onAdd({ minDiff, maxDiff, handicapText });
      cancelEdit();
    } catch (ex) {
      setErr(ex.message || "Có lỗi khi lưu quy tắc.");
    }
    setBusy(false);
  }

  async function remove(r) {
    if (!window.confirm(`Xóa quy tắc "${r.min_diff}–${r.max_diff ?? "trở lên"}"?`)) return;
    setErr("");
    try {
      await onDelete(r.id);
    } catch (ex) {
      setErr(ex.message || "Có lỗi khi xóa.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }} className="flex flex-col gap-3">
        <div style={{ fontSize: 17, fontWeight: 700, fontFamily: FONT_DISPLAY }}>Quy tắc điểm chấp</div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
          Mỗi khoảng chênh lệch điểm rating giữa 2 VĐV ứng với 1 mức điểm chấp đề xuất (VD: chênh lệch 50–99 → đề xuất "0-2-0").
          Để trống "Điểm chấp" nếu khoảng đó <b>không chấp</b>. Các khoảng không được chồng lấn nhau. Quy tắc này chỉ dùng để{" "}
          <b>đề xuất</b> ở giao diện nhập trận khi giải/giao hữu là "Có chấp điểm" — không tự động áp dụng.
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }} className="flex flex-col gap-3">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "4px 8px" }}>Chênh lệch điểm — Từ</th>
              <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "4px 8px" }}>Đến (trống = trở lên)</th>
              <th style={{ textAlign: "left", fontSize: 12, color: C.muted, padding: "4px 8px" }}>Điểm chấp đề xuất</th>
              <th style={{ padding: "4px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td className="tabular" style={{ padding: "6px 8px", fontSize: 13.5 }}>{r.min_diff}</td>
                <td className="tabular" style={{ padding: "6px 8px", fontSize: 13.5 }}>{r.max_diff ?? "trở lên"}</td>
                <td className="tabular" style={{ padding: "6px 8px", fontSize: 13.5 }}>{r.handicap_text || <span style={{ color: C.muted }}>Không chấp</span>}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                  <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12.5 }} onClick={() => startEdit(r)}>Sửa</button>{" "}
                  <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 12.5, color: C.bad }} onClick={() => remove(r)}>Xóa</button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={4} style={{ padding: "16px 8px" }}><EmptyState text="Chưa có quy tắc điểm chấp nào." /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }} className="flex flex-col gap-3">
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{editingId ? "Sửa quy tắc" : "Thêm quy tắc mới"}</div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Chênh lệch điểm — Từ">
            <input type="number" min="0" style={inputStyle} value={form.minDiff} onChange={(e) => setForm((f) => ({ ...f, minDiff: e.target.value }))} required />
          </Field>
          <Field label="Đến (để trống = trở lên)">
            <input type="number" min="0" style={inputStyle} value={form.maxDiff} onChange={(e) => setForm((f) => ({ ...f, maxDiff: e.target.value }))} />
          </Field>
          <Field label="Điểm chấp đề xuất (để trống = không chấp)">
            <input type="text" placeholder="VD: 2-0-2" style={inputStyle} value={form.handicapText} onChange={(e) => setForm((f) => ({ ...f, handicapText: e.target.value }))} />
          </Field>
        </div>
        {err && <div style={{ color: C.bad, fontSize: 13 }}>{err}</div>}
        <div className="flex items-center gap-3">
          <button type="submit" style={btnPrimary} disabled={busy}>{busy ? "Đang lưu…" : editingId ? "Lưu thay đổi" : "Thêm quy tắc"}</button>
          {editingId && <button type="button" style={btnGhost} onClick={cancelEdit}>Hủy</button>}
        </div>
      </form>
    </div>
  );
}

function UsersTab({ players, onCreateUser, onUpdateRole, onResetPassword, onDeleteUser }) {
  const [users, setUsers] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);

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

  async function removeUser(u) {
    const warn = u.player_name
      ? `Xóa tài khoản "${u.username}"? VĐV "${u.player_name}" đang gắn với tài khoản này sẽ được GỠ RA (VĐV không bị xóa, chỉ mất liên kết).`
      : `Xóa tài khoản "${u.username}"? Không thể hoàn tác.`;
    if (!window.confirm(warn)) return;
    try {
      await onDeleteUser(u.id);
      await load();
    } catch (err) {
      alert(err.message || "Có lỗi khi xóa user.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button style={btnPrimary} onClick={() => setShowAdd(true)}>+ Thêm user</button>
      </div>

      {showAdd && (
        <AddUserModal
          players={players}
          linkedPlayerIds={(users || []).filter((u) => u.player).map((u) => u.player)}
          onClose={() => setShowAdd(false)}
          onCreate={async (payload) => { await onCreateUser(payload); await load(); }}
        />
      )}

      {loadErr && <EmptyState text={loadErr} />}

      {users === null ? null : users.length === 0 ? (
        <EmptyState text="Chưa có user nào." />
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14 }}>
          {users.map((u, i) => (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: i < users.length - 1 ? `1px solid ${C.line}` : "none", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{u.username}</div>
                {u.player_name && <div style={{ fontSize: 12, color: C.muted }}>Gắn với VĐV: {u.player_name}</div>}
                {u.email && <div style={{ fontSize: 12, color: C.muted }}>{u.email}</div>}
              </div>
              <div className="flex items-center gap-2">
                <select style={{ ...inputStyle, padding: "6px 10px", fontSize: 13 }} value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                  {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <button style={{ ...btnGhost, padding: "6px 12px", fontSize: 12.5 }} onClick={() => resetPassword(u.id, u.username)}>Đổi mật khẩu</button>
                <button style={{ ...btnGhost, padding: "6px 12px", fontSize: 12.5, color: C.bad, borderColor: C.bad + "55" }} onClick={() => removeUser(u)}>Xóa</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Popup thêm user mới ---------- */
function AddUserModal({ players, linkedPlayerIds, onClose, onCreate }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("sm@123456");
  const [newRole, setNewRole] = useState("user");
  const [playerId, setPlayerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSaving(true); setError("");
    try {
      await onCreate({ username: username.trim(), password, newRole, playerId: playerId || null });
      onClose();
    } catch (err) {
      setError(err.message || "Có lỗi khi tạo user.");
    }
    setSaving(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(16,22,43,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 14, padding: 24, width: "100%", maxWidth: 400 }}
        className="flex flex-col gap-3"
      >
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: FONT_DISPLAY }}>Thêm user mới</div>
        <Field label="Tên đăng nhập">
          <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </Field>
        <Field label="Mật khẩu">
          <input style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Vai trò">
          <select style={inputStyle} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Tên VĐV (tuỳ chọn — gắn tài khoản với 1 VĐV)">
          <PlayerCombobox players={players} value={playerId} onChange={setPlayerId} placeholder="— Không gắn VĐV —" excludeIds={linkedPlayerIds} />
        </Field>
        {error && <div style={{ color: C.bad, fontSize: 13 }}>{error}</div>}
        <div className="flex gap-2" style={{ marginTop: 4 }}>
          <button type="submit" style={btnPrimary} disabled={saving}>{saving ? "Đang lưu…" : "Lưu user"}</button>
          <button type="button" style={btnGhost} onClick={onClose}>Huỷ</button>
        </div>
      </form>
    </div>
  );
}
