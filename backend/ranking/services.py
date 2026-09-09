"""
Toàn bộ logic nghiệp vụ tính điểm — cùng công thức đã thống nhất với bản demo:
- Elo cho từng trận đấu ĐƠN, hệ số K theo loại trận.
- Trận ĐÔI: chỉ ghi nhận kết quả, không tính Elo (mỗi đội luôn 0 điểm).
- Điểm thưởng một lần theo thành tích chung cuộc của giải.
Tách riêng khỏi views/admin để dễ kiểm thử độc lập (unit test).
"""
from django.utils import timezone
from .models import Match, PointHistory, Tournament, TournamentResult

K_FACTOR = {
    Tournament.KHONG_CHAP: 32,
    Tournament.CO_CHAP: 20,
    Match.GIAO_HUU: 10,
}

LOAI_GIAI_LABEL = {
    Tournament.KHONG_CHAP: "Không chấp điểm",
    Tournament.CO_CHAP: "Có chấp điểm",
    Match.GIAO_HUU: "Giao hữu",
}

BONUS_BASE = {"vo_dich": 50, "a_quan": 30, "hang_ba": 20, "tu_ket": 10}
BONUS_LABEL = {"vo_dich": "Vô địch", "a_quan": "Á quân", "hang_ba": "Hạng Ba", "tu_ket": "Tứ kết"}
BONUS_MULT = {Tournament.KHONG_CHAP: 1.6, Tournament.CO_CHAP: 1.0}  # giao hữu: không áp dụng


def expected_score(r_a, r_b):
    return 1 / (1 + 10 ** ((r_b - r_a) / 400))


def compute_match_delta(r_a, r_b, winner, loai_tran):
    k = K_FACTOR.get(loai_tran, 20)
    e_a = expected_score(r_a, r_b)
    s_a = 1 if winner == "A" else 0
    delta_a = round(k * (s_a - e_a))
    return delta_a, -delta_a


def compute_bonus(placement, loai_giai):
    mult = BONUS_MULT.get(loai_giai)
    if not mult:
        return 0
    return round(BONUS_BASE[placement] * mult)


def _reason_prefix(tournament, loai, is_doubles):
    tran_word = "đôi" if is_doubles else "đấu"
    if tournament:
        return f"Trận {tran_word} ({LOAI_GIAI_LABEL[loai]}) — {tournament.name}"
    return f"Trận {tran_word} giao hữu"


def record_match(*, tournament, mode="don", player_a, player_b, player_a2=None, player_b2=None,
                  sets_a, sets_b, date=None):
    """Tạo 1 trận đấu (đơn hoặc đôi), tự tính điểm, cập nhật rating, ghi lịch sử điểm."""
    if sets_a == sets_b:
        raise ValueError("Tỷ số không thể hòa")

    loai = tournament.type if tournament else Match.GIAO_HUU
    date = date or timezone.localdate()
    winner_side = "A" if sets_a > sets_b else "B"
    is_doubles = mode == "doi"

    if is_doubles:
        if not player_a2 or not player_b2:
            raise ValueError("Đánh đôi cần đủ 2 VĐV mỗi đội")
        ids = {player_a.id, player_a2.id, player_b.id, player_b2.id}
        if len(ids) != 4:
            raise ValueError("4 VĐV trong trận đôi phải khác nhau")
        delta_a, delta_b = 0, 0  # đánh đôi: không tính Elo
    else:
        delta_a, delta_b = compute_match_delta(player_a.rating, player_b.rating, winner_side, loai)

    match = Match.objects.create(
        tournament=tournament, type=loai, mode=mode,
        player_a=player_a, player_b=player_b,
        player_a2=player_a2 if is_doubles else None,
        player_b2=player_b2 if is_doubles else None,
        sets_a=sets_a, sets_b=sets_b, winner_side=winner_side,
        delta_a=delta_a, delta_b=delta_b, date=date,
    )

    _apply_and_log(match, is_doubles=is_doubles)
    return match


def _apply_and_log(match, is_doubles):
    """Cộng delta vào rating từng VĐV liên quan + ghi PointHistory cho trận `match`."""
    prefix = _reason_prefix(match.tournament, match.type, is_doubles)
    team_a = [match.player_a, match.player_a2] if is_doubles else [match.player_a]
    team_b = [match.player_b, match.player_b2] if is_doubles else [match.player_b]

    def apply_team(team, other_team, delta, side_won):
        for p in team:
            before = p.rating
            p.rating += delta
            p.save(update_fields=["rating"])
            if is_doubles:
                teammate = [x for x in team if x.id != p.id]
                teammate_name = teammate[0].name if teammate else ""
                opp_names = " & ".join(x.name for x in other_team)
                reason = f"{prefix} cùng {teammate_name} vs {opp_names}"
            else:
                opp_names = other_team[0].name
                reason = f"{prefix} vs {opp_names}"
            PointHistory.objects.create(
                player=p, date=match.date, before=before, after=p.rating, delta=delta,
                reason=reason, match=match,
                match_score=f"{match.sets_a}–{match.sets_b}" if side_won == "A" else f"{match.sets_b}–{match.sets_a}",
                match_result="thắng" if match.winner_side == side_won else "thua",
                is_doubles=is_doubles,
            )

    apply_team(team_a, team_b, match.delta_a, "A")
    apply_team(team_b, team_a, match.delta_b, "B")


def _revert(match):
    """Hoàn tác ảnh hưởng điểm của 1 trận đấu lên tất cả VĐV liên quan, xoá lịch sử điểm cũ."""
    is_doubles = match.mode == "doi"
    team_a = [match.player_a, match.player_a2] if is_doubles else [match.player_a]
    team_b = [match.player_b, match.player_b2] if is_doubles else [match.player_b]
    for p in team_a:
        p.rating -= match.delta_a
        p.save(update_fields=["rating"])
    for p in team_b:
        p.rating -= match.delta_b
        p.save(update_fields=["rating"])
    match.history_entries.all().delete()


def delete_match(match):
    """Xóa trận đấu, hoàn tác điểm cho toàn bộ VĐV liên quan (cả đơn lẫn đôi)."""
    _revert(match)
    match.delete()


def edit_match(match, *, player_a, player_b, player_a2=None, player_b2=None, sets_a, sets_b, date=None):
    """Sửa lại 1 trận đã có: hoàn tác ảnh hưởng cũ, tính lại theo thông tin mới."""
    if sets_a == sets_b:
        raise ValueError("Tỷ số không thể hòa")

    is_doubles = match.mode == "doi"
    if is_doubles and (not player_a2 or not player_b2):
        raise ValueError("Đánh đôi cần đủ 2 VĐV mỗi đội")
    if is_doubles:
        ids = {player_a.id, player_a2.id, player_b.id, player_b2.id}
        if len(ids) != 4:
            raise ValueError("4 VĐV trong trận đôi phải khác nhau")

    _revert(match)

    # Nạp lại rating mới nhất (sau khi hoàn tác) từ DB
    player_a.refresh_from_db()
    player_b.refresh_from_db()
    if is_doubles:
        player_a2.refresh_from_db()
        player_b2.refresh_from_db()

    winner_side = "A" if sets_a > sets_b else "B"
    if is_doubles:
        delta_a, delta_b = 0, 0
    else:
        delta_a, delta_b = compute_match_delta(player_a.rating, player_b.rating, winner_side, match.type)

    match.player_a = player_a
    match.player_b = player_b
    match.player_a2 = player_a2 if is_doubles else None
    match.player_b2 = player_b2 if is_doubles else None
    match.sets_a = sets_a
    match.sets_b = sets_b
    match.winner_side = winner_side
    match.delta_a = delta_a
    match.delta_b = delta_b
    if date:
        match.date = date
    match.save()

    _apply_and_log(match, is_doubles=is_doubles)
    return match


ROLE_GROUP = {
    "admin": "QuanTriVien",
    "manager": "QuanLyGiaiDau",
    "scorer": "NguoiNhapLieu",
    "user": "NguoiDung",
}
GROUP_ROLE = {v: k for k, v in ROLE_GROUP.items()}


def get_role(user):
    """Xác định vai trò của user: admin/manager/scorer/user, hoặc None nếu chưa đăng nhập."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "admin"
    names = set(user.groups.values_list("name", flat=True))
    for group_name in names:
        role = GROUP_ROLE.get(group_name)
        if role:
            return role
    return "user"


def adjust_rating(player, new_rating, reason=None):
    """Admin chỉnh sửa trực tiếp điểm rating của VĐV, có ghi lại lịch sử điểm."""
    new_rating = int(new_rating)
    if new_rating == player.rating:
        return None
    before = player.rating
    player.rating = new_rating
    player.save(update_fields=["rating"])
    return PointHistory.objects.create(
        player=player, date=timezone.localdate(), before=before, after=new_rating,
        delta=new_rating - before, reason=reason or "Quản trị viên chỉnh sửa điểm thủ công",
    )


def record_result(*, tournament, player, placement):
    """Cộng điểm thưởng một lần theo thành tích chung cuộc của giải."""
    bonus = compute_bonus(placement, tournament.type)
    if not bonus:
        return None

    before = player.rating
    player.rating += bonus
    player.save(update_fields=["rating"])

    result = TournamentResult.objects.create(
        tournament=tournament, player=player, placement=placement, bonus=bonus
    )
    PointHistory.objects.create(
        player=player, date=timezone.localdate(), before=before, after=player.rating,
        delta=bonus, reason=f"Thưởng thành tích: {BONUS_LABEL[placement]} — {tournament.name}",
    )
    return result
