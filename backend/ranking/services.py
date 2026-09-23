"""
Toàn bộ logic nghiệp vụ tính điểm — cùng công thức đã thống nhất với bản demo:
- Elo cho từng trận đấu ĐƠN, hệ số K theo loại trận.
- Trận ĐÔI: chỉ ghi nhận kết quả, không tính Elo (mỗi đội luôn 0 điểm).
- Điểm thưởng một lần theo thành tích chung cuộc của giải.
Tách riêng khỏi views/admin để dễ kiểm thử độc lập (unit test).
"""
import json
import os
import urllib.parse
import urllib.request

from django.utils import timezone
from .models import Match, PointHistory, Tournament, TournamentResult


def verify_recaptcha(token, remote_ip=None):
    """
    Gọi Google reCAPTCHA API để xác minh token do widget phía frontend gửi lên.
    Nếu chưa cấu hình RECAPTCHA_SECRET_KEY (chưa bật tính năng) -> coi như hợp lệ (không chặn oan).
    Nếu gọi Google lỗi (mất mạng, timeout...) -> coi như KHÔNG hợp lệ (an toàn hơn là cho qua).
    """
    secret = os.environ.get("RECAPTCHA_SECRET_KEY", "")
    if not secret:
        return True
    if not token:
        return False
    payload = {"secret": secret, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip
    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request("https://www.google.com/recaptcha/api/siteverify", data=data)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode())
        return bool(result.get("success"))
    except Exception:
        return False

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
                  sets_a=None, sets_b=None, date=None, status="completed"):
    """Tạo 1 trận đấu (đơn hoặc đôi), tự tính điểm, cập nhật rating, ghi lịch sử điểm.
    status="scheduled": trận sắp diễn ra, chưa có tỷ số, không tính điểm — chỉ ghi nhận lịch."""
    loai = tournament.type if tournament else Match.GIAO_HUU
    date = date or timezone.localdate()
    is_doubles = mode == "doi"

    if is_doubles:
        if not player_a2 or not player_b2:
            raise ValueError("Đánh đôi cần đủ 2 VĐV mỗi đội")
        ids = {player_a.id, player_a2.id, player_b.id, player_b2.id}
        if len(ids) != 4:
            raise ValueError("4 VĐV trong trận đôi phải khác nhau")

    if status == "scheduled":
        match = Match.objects.create(
            tournament=tournament, type=loai, mode=mode, status="scheduled",
            player_a=player_a, player_b=player_b,
            player_a2=player_a2 if is_doubles else None,
            player_b2=player_b2 if is_doubles else None,
            sets_a=None, sets_b=None, winner_side=None,
            delta_a=0, delta_b=0, date=date,
        )
        return match

    if sets_a is None or sets_b is None or sets_a == sets_b:
        raise ValueError("Tỷ số không thể hòa")

    winner_side = "A" if sets_a > sets_b else "B"

    if is_doubles:
        delta_a, delta_b = 0, 0  # đánh đôi: không tính Elo
    else:
        delta_a, delta_b = compute_match_delta(player_a.rating, player_b.rating, winner_side, loai)

    match = Match.objects.create(
        tournament=tournament, type=loai, mode=mode, status="completed",
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


def delete_player(player):
    """
    Xóa VĐV: hoàn tác điểm cho các VĐV KHÁC từng thi đấu cùng (mỗi trận bị xóa
    sẽ hoàn tác điểm cho cả 2 bên trước khi xóa), xóa toàn bộ trận đấu và
    thành tích giải đấu của VĐV này, rồi mới xóa chính VĐV đó.
    """
    matches = (
        Match.objects.filter(player_a=player)
        | Match.objects.filter(player_b=player)
        | Match.objects.filter(player_a2=player)
        | Match.objects.filter(player_b2=player)
    ).distinct()
    for m in matches:
        _revert(m)  # hoàn tác điểm cho VĐV còn lại (và cả VĐV này, không quan trọng vì sắp xóa)
        m.delete()

    TournamentResult.objects.filter(player=player).delete()
    player.delete()


def edit_match(match, *, player_a, player_b, player_a2=None, player_b2=None, sets_a=None, sets_b=None, date=None):
    """Sửa lại 1 trận đã có: hoàn tác ảnh hưởng cũ (nếu đã tính điểm), tính lại theo thông tin mới.
    Nếu chưa nhập tỷ số (sets_a/sets_b rỗng): trận vẫn ở trạng thái "Sắp diễn ra", không tính điểm.
    Nếu nhập tỷ số (lần đầu hoặc sửa lại): tính điểm và chuyển trạng thái "Đã kết thúc"."""
    is_doubles = match.mode == "doi"
    if is_doubles and (not player_a2 or not player_b2):
        raise ValueError("Đánh đôi cần đủ 2 VĐV mỗi đội")
    if is_doubles:
        ids = {player_a.id, player_a2.id, player_b.id, player_b2.id}
        if len(ids) != 4:
            raise ValueError("4 VĐV trong trận đôi phải khác nhau")

    entering_score = sets_a is not None and sets_b is not None
    if entering_score and sets_a == sets_b:
        raise ValueError("Tỷ số không thể hòa")

    # Nếu trận trước đó đã tính điểm (Đã kết thúc), hoàn tác trước khi tính lại
    if match.status == "completed":
        _revert(match)
        player_a.refresh_from_db()
        player_b.refresh_from_db()
        if is_doubles:
            player_a2.refresh_from_db()
            player_b2.refresh_from_db()

    match.player_a = player_a
    match.player_b = player_b
    match.player_a2 = player_a2 if is_doubles else None
    match.player_b2 = player_b2 if is_doubles else None
    if date:
        match.date = date

    if not entering_score:
        # Vẫn chưa có tỷ số: giữ ở trạng thái Sắp diễn ra
        match.sets_a = None
        match.sets_b = None
        match.winner_side = None
        match.delta_a = 0
        match.delta_b = 0
        match.status = "scheduled"
        match.save()
        return match

    winner_side = "A" if sets_a > sets_b else "B"
    if is_doubles:
        delta_a, delta_b = 0, 0
    else:
        delta_a, delta_b = compute_match_delta(player_a.rating, player_b.rating, winner_side, match.type)

    match.sets_a = sets_a
    match.sets_b = sets_b
    match.winner_side = winner_side
    match.delta_a = delta_a
    match.delta_b = delta_b
    match.status = "completed"
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


def get_linked_player(user):
    """Trả về VĐV đang gắn với tài khoản này, hoặc None nếu chưa gắn/chưa có hồ sơ."""
    from .models import UserProfile
    try:
        return user.profile.player
    except UserProfile.DoesNotExist:
        return None


def set_linked_player(user, player):
    """
    Gắn tài khoản `user` với `player` (hoặc gỡ gắn nếu player=None).
    Mỗi VĐV chỉ được gắn với duy nhất 1 tài khoản — raise ValueError nếu VĐV đã gắn tài khoản khác.
    """
    from .models import UserProfile
    if player is not None:
        conflict = UserProfile.objects.filter(player=player).exclude(user=user).first()
        if conflict:
            raise ValueError(f"VĐV này đã được gắn với tài khoản khác ({conflict.user.username}).")
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.player = player
    profile.save()


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


def _validate_result_group(content_type, player, teammates):
    teammates = list(teammates or [])
    if content_type == "don" and teammates:
        raise ValueError("Nội dung Đơn không có đồng đội.")
    if content_type == "doi" and len(teammates) != 1:
        raise ValueError("Nội dung Đôi cần đúng 1 đồng đội.")
    if content_type == "dong_doi" and len(teammates) < 1:
        raise ValueError("Nội dung Đồng đội cần ít nhất 1 đồng đội.")
    all_ids = [player.id] + [t.id for t in teammates]
    if len(set(all_ids)) != len(all_ids):
        raise ValueError("Danh sách VĐV/đồng đội không được trùng nhau.")
    return teammates


def record_result(*, tournament, content_type="don", player, teammates=None, placement):
    """Cộng điểm thưởng theo thành tích chung cuộc của giải, cho VĐV và (nếu có) đồng đội cùng nội dung."""
    teammates = _validate_result_group(content_type, player, teammates)
    bonus = compute_bonus(placement, tournament.type)
    if not bonus:
        return None

    result = TournamentResult.objects.create(
        tournament=tournament, content_type=content_type, player=player, placement=placement,
        bonus=bonus, bonus_applied=True,
    )
    if teammates:
        result.teammates.set(teammates)

    for p in [player] + teammates:
        before = p.rating
        p.rating += bonus
        p.save(update_fields=["rating"])
        PointHistory.objects.create(
            player=p, date=timezone.localdate(), before=before, after=p.rating,
            delta=bonus, reason=f"Thưởng thành tích: {BONUS_LABEL[placement]} — {tournament.name}",
            result=result,
        )
    return result


def save_result_only(*, tournament, content_type="don", player, teammates=None, placement):
    """Chỉ lưu lại thành tích (đơn/đôi/đồng đội), KHÔNG cộng điểm cho ai."""
    teammates = _validate_result_group(content_type, player, teammates)
    result = TournamentResult.objects.create(
        tournament=tournament, content_type=content_type, player=player, placement=placement,
        bonus=0, bonus_applied=False,
    )
    if teammates:
        result.teammates.set(teammates)
    return result


def _revert_result_bonus(result):
    if result.bonus_applied and result.bonus:
        for p in [result.player] + list(result.teammates.all()):
            p.rating -= result.bonus
            p.save(update_fields=["rating"])
    result.history_entries.all().delete()


def edit_result(result, *, content_type, placement, player, teammates, apply_bonus):
    """Sửa thành tích: hoàn tác hiệu ứng điểm cũ (nếu có), ghi lại thông tin mới, cộng điểm lại nếu apply_bonus=True."""
    teammates = _validate_result_group(content_type, player, teammates)
    _revert_result_bonus(result)

    result.content_type = content_type
    result.placement = placement
    result.player = player
    result.bonus = 0
    result.bonus_applied = False
    result.save()
    result.teammates.set(teammates)

    if apply_bonus:
        bonus = compute_bonus(placement, result.tournament.type)
        if bonus:
            for p in [player] + teammates:
                before = p.rating
                p.rating += bonus
                p.save(update_fields=["rating"])
                PointHistory.objects.create(
                    player=p, date=timezone.localdate(), before=before, after=p.rating,
                    delta=bonus, reason=f"Thưởng thành tích: {BONUS_LABEL[placement]} — {result.tournament.name}",
                    result=result,
                )
            result.bonus = bonus
            result.bonus_applied = True
            result.save(update_fields=["bonus", "bonus_applied"])
    return result


def delete_result(result):
    """Xóa 1 thành tích: hoàn tác điểm đã cộng (nếu có) cho VĐV + đồng đội, rồi xóa."""
    _revert_result_bonus(result)
    result.delete()


def delete_tournament(tournament):
    """
    Xóa giải đấu: xóa toàn bộ trận đấu của giải (hoàn tác điểm cho VĐV liên quan),
    xóa toàn bộ thành tích/điểm thưởng của giải (hoàn tác điểm cho VĐV nhận thưởng),
    rồi mới xóa chính giải đấu đó.
    """
    for m in Match.objects.filter(tournament=tournament):
        _revert(m)
        m.delete()

    for r in TournamentResult.objects.filter(tournament=tournament):
        delete_result(r)

    tournament.delete()
