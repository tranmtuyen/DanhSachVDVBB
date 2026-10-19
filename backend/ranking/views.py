import json
import urllib.parse
import urllib.request

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from . import services
from .models import (
    HandicapRule, KnockoutSlot, LoginAttempt, Match, MatchMedia, Player, PointHistory, RankingConfig, Tournament,
    TournamentGroup, TournamentResult, TournamentWaitlist,
)
from .serializers import (
    FriendlySelfRegisterSerializer, GroupSerializer, HandicapRuleSerializer, KnockoutSlotSerializer,
    MatchCreateSerializer, MatchMediaSerializer, MatchSerializer, MatchUpdateSerializer, PlayerPhotoSerializer,
    PlayerSerializer, PointHistorySerializer, RankingConfigSerializer, ResultCreateSerializer, ResultSerializer,
    ResultUpdateSerializer, TournamentSerializer, TournamentWaitlistSerializer, UserSerializer,
)

RECAPTCHA_THRESHOLD = 5  # Số lần sai liên tiếp trước khi bắt xác minh reCAPTCHA
RECAPTCHA_RESET_MINUTES = 30  # Sau khoảng thời gian này không có lần sai mới, tự đặt lại bộ đếm
RECAPTCHA_SCORE_MIN = 0.5  # Điểm reCAPTCHA v3 tối thiểu (0.0 = chắc chắn bot, 1.0 = chắc chắn người)


def _verify_recaptcha(token, remote_ip=None):
    """Gọi API siteverify của Google để kiểm tra token reCAPTCHA v3 và điểm số."""
    secret = getattr(settings, "RECAPTCHA_SECRET_KEY", "")
    if not secret:
        # Chưa cấu hình secret key ở server — không chặn đăng nhập (tránh tự khoá cả hệ thống nếu quên cấu hình).
        return True
    if not token:
        return False
    data = {"secret": secret, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        req = urllib.request.Request(
            "https://www.google.com/recaptcha/api/siteverify",
            data=urllib.parse.urlencode(data).encode("utf-8"),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return False
    return bool(result.get("success")) and float(result.get("score", 0)) >= RECAPTCHA_SCORE_MIN


def _role_permission(*allowed_roles):
    """Tạo permission class: ai cũng xem được, chỉ vai trò trong allowed_roles mới được ghi."""

    class _Perm(permissions.BasePermission):
        def has_permission(self, request, view):
            if request.method in permissions.SAFE_METHODS:
                return True
            role = services.get_role(request.user)
            return role in allowed_roles

    return _Perm


IsAdminOnly = _role_permission("admin")
IsAdminOrManager = _role_permission("admin", "manager")
IsAdminOrManagerOrScorer = _role_permission("admin", "manager", "scorer")


def _require_role(request, roles):
    if services.get_role(request.user) not in roles:
        raise PermissionDenied("Bạn không có quyền thực hiện thao tác này.")


# ================= Đăng nhập / đăng xuất / thông tin bản thân =================

@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login_view(request):
    username = request.data.get("username", "")
    password = request.data.get("password", "")
    recaptcha_token = request.data.get("recaptcha_token", "")
    uname_key = username.strip().lower()

    attempt = None
    need_recaptcha = False
    if uname_key:
        attempt, _ = LoginAttempt.objects.get_or_create(username=uname_key)
        # Tự đặt lại bộ đếm nếu đã lâu không có lần sai mới (tránh khoá "vĩnh viễn")
        if attempt.failed_count > 0 and (timezone.now() - attempt.updated_at).total_seconds() > RECAPTCHA_RESET_MINUTES * 60:
            attempt.failed_count = 0

        if attempt.failed_count >= RECAPTCHA_THRESHOLD:
            need_recaptcha = True
            if not _verify_recaptcha(recaptcha_token, request.META.get("REMOTE_ADDR")):
                attempt.save()  # lưu lại việc tự đặt lại bộ đếm ở trên (nếu có), dù chưa qua được reCAPTCHA
                return Response(
                    {"detail": "Xác minh bảo mật không thành công, vui lòng thử lại.", "captcha_required": True},
                    status=400,
                )

    user = authenticate(request, username=username, password=password)
    if not user:
        if attempt is not None:
            attempt.failed_count += 1
            if attempt.failed_count >= RECAPTCHA_THRESHOLD:
                need_recaptcha = True
            attempt.save()
            extra = {"captcha_required": True} if need_recaptcha else {}
            return Response({"detail": "Sai tên đăng nhập hoặc mật khẩu.", **extra}, status=400)
        return Response({"detail": "Sai tên đăng nhập hoặc mật khẩu."}, status=400)

    if attempt is not None:
        attempt.failed_count = 0
        attempt.save()

    token, _ = Token.objects.get_or_create(user=user)
    player = services.get_linked_player(user)
    photo = request.build_absolute_uri(player.photo.url) if player and player.photo else None
    return Response({
        "token": token.key, "id": user.id, "username": user.username, "role": services.get_role(user),
        "player_id": player.id if player else None, "photo": photo,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def logout_view(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=204)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def me_view(request):
    player = services.get_linked_player(request.user)
    photo = request.build_absolute_uri(player.photo.url) if player and player.photo else None
    return Response({
        "id": request.user.id, "username": request.user.username, "role": services.get_role(request.user),
        "player_id": player.id if player else None, "photo": photo,
    })


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def update_my_photo_view(request):
    """Cho phép tài khoản đã gắn VĐV tự đổi ảnh VĐV của mình (vẫn qua đúng validator giới hạn 1MB)."""
    player = services.get_linked_player(request.user)
    if not player:
        return Response({"detail": "Tài khoản của bạn chưa được gắn với VĐV nào."}, status=400)
    if "photo" not in request.FILES:
        return Response({"detail": "Cần chọn ảnh để tải lên."}, status=400)
    serializer = PlayerPhotoSerializer(player, data={"photo": request.FILES["photo"]}, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(PlayerSerializer(player, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def change_password_view(request):
    old_password = request.data.get("old_password", "")
    new_password = request.data.get("new_password", "")
    if not request.user.check_password(old_password):
        return Response({"detail": "Mật khẩu hiện tại không đúng."}, status=400)
    try:
        validate_password(new_password, request.user)
    except DjangoValidationError as e:
        return Response({"detail": " ".join(e.messages)}, status=400)
    request.user.set_password(new_password)
    request.user.save()
    # Thu hồi toàn bộ token cũ (đề phòng bị lộ ở nơi khác), cấp token mới cho phiên hiện tại dùng tiếp.
    Token.objects.filter(user=request.user).delete()
    token = Token.objects.create(user=request.user)
    return Response({"token": token.key})


# ================= Quản lý User (chỉ Quản trị viên) =================

class IsAdminStrict(permissions.BasePermission):
    """Không cho phép GET công khai như IsAdminOnly — chỉ Quản trị viên mới được xem/sửa User."""

    def has_permission(self, request, view):
        return services.get_role(request.user) == "admin"


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = UserSerializer
    permission_classes = [IsAdminStrict]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.id == request.user.id:
            raise ValidationError("Không thể tự xóa tài khoản đang đăng nhập.")
        if services.get_role(user) == "admin":
            other_admins_exist = any(
                services.get_role(u) == "admin" for u in User.objects.exclude(id=user.id)
            )
            if not other_admins_exist:
                raise ValidationError("Không thể xóa Quản trị viên cuối cùng.")
        # UserProfile (nếu có gắn VĐV) sẽ tự bị xóa theo (on_delete=CASCADE trên UserProfile.user),
        # nhờ đó VĐV được tự động gỡ khỏi tài khoản này — không cần xử lý thêm.
        user.delete()
        return Response(status=204)


class PlayerViewSet(viewsets.ModelViewSet):
    queryset = Player.objects.all().order_by("-rating")
    serializer_class = PlayerSerializer
    permission_classes = [IsAdminOnly]

    def update(self, request, *args, **kwargs):
        # Không cho sửa "rating" qua PATCH thường — mọi thay đổi điểm phải qua adjust_rating() để có audit log.
        data = request.data.copy()
        if hasattr(data, "pop"):
            data.pop("rating", None)
        partial = kwargs.get("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        player = self.get_object()
        services.delete_player(player)
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def adjust_rating(self, request, pk=None):
        player = self.get_object()
        raw_rating = request.data.get("rating")
        if raw_rating is None:
            raise ValidationError("Thiếu giá trị rating mới.")
        try:
            new_rating = int(str(raw_rating).strip())
        except (TypeError, ValueError):
            raise ValidationError("Rating phải là số nguyên.")
        if not (0 <= new_rating <= 10000):
            raise ValidationError("Rating phải nằm trong khoảng 0–10000.")
        services.adjust_rating(player, new_rating)
        return Response(PlayerSerializer(player, context={"request": request}).data)


class TournamentViewSet(viewsets.ModelViewSet):
    queryset = Tournament.objects.all().order_by("-date")
    serializer_class = TournamentSerializer
    permission_classes = [IsAdminOrManager]

    def get_permissions(self):
        # Xóa giải đấu / xóa sơ đồ đấu / đổi tên vòng đấu: chỉ Quản trị viên (thao tác hoàn tác điểm
        # hàng loạt hoặc có thể ảnh hưởng dữ liệu đã nhập). Tạo sơ đồ: Admin/Quản lý giải (như tạo giải).
        if self.action in ("destroy", "delete_bracket", "rename_knockout_round"):
            return [IsAdminOnly()]
        return [IsAdminOrManager()]

    def destroy(self, request, *args, **kwargs):
        tournament = self.get_object()
        services.delete_tournament(tournament)
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def generate_bracket(self, request, pk=None):
        """Sinh toàn bộ khung sơ đồ vòng loại trực tiếp (các ô trống tới Chung kết)."""
        tournament = self.get_object()
        try:
            size = int(request.data.get("first_round_matches"))
        except (TypeError, ValueError):
            raise ValidationError("Số trận vòng đầu không hợp lệ.")
        try:
            services.generate_bracket(tournament, size)
        except ValueError as e:
            raise ValidationError(str(e))
        slots = KnockoutSlot.objects.filter(tournament=tournament).order_by("round_no", "slot_index")
        return Response(KnockoutSlotSerializer(slots, many=True).data, status=201)

    @action(detail=True, methods=["post"])
    def delete_bracket(self, request, pk=None):
        """Xóa toàn bộ sơ đồ vòng loại trực tiếp (kể cả các trận đã nhập trong đó, hoàn tác điểm)."""
        tournament = self.get_object()
        services.delete_bracket(tournament)
        return Response(status=204)

    @action(detail=True, methods=["patch"])
    def rename_knockout_round(self, request, pk=None):
        """Đổi tên 1 vòng đấu trong sơ đồ (áp dụng cho mọi ô + trận đã nhập thuộc vòng đó)."""
        tournament = self.get_object()
        try:
            round_no = int(request.data.get("round_no"))
        except (TypeError, ValueError):
            raise ValidationError("Thiếu vòng đấu cần đổi tên.")
        try:
            services.rename_knockout_round(tournament, round_no, request.data.get("name", ""))
        except ValueError as e:
            raise ValidationError(str(e))
        slots = KnockoutSlot.objects.filter(tournament=tournament).order_by("round_no", "slot_index")
        return Response(KnockoutSlotSerializer(slots, many=True).data)


class MatchViewSet(viewsets.ModelViewSet):
    # annotate _media_count 1 lần ở đây để MatchSerializer.get_media_count không phải tự đếm
    # riêng cho mỗi trận (tránh N+1 query khi danh sách trận dài).
    queryset = Match.objects.annotate(_media_count=Count("media_items")).order_by("-date")
    serializer_class = MatchSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        # Sửa/xóa trận đấu: chỉ Quản trị viên. Tạo trận mới: giữ nguyên như cũ (admin/manager/scorer).
        # self-register/confirm/reject: VĐV tự đăng ký Giao hữu — chỉ cần đăng nhập (ràng buộc thêm,
        # như "phải có VĐV liên kết"/"chỉ xác nhận trận của chính mình", được kiểm tra trong từng action).
        if self.action in ("partial_update", "destroy"):
            return [IsAdminOnly()]
        if self.action == "create":
            return [IsAdminOrManagerOrScorer()]
        if self.action in ("self_register", "confirm", "reject"):
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        # Không có cron/celery trong dự án này: tự chuyển các trận "Chờ xác nhận" đã quá NGÀY DIỄN RA
        # (chưa được đối thủ xác nhận/từ chối kịp) sang "Hết hạn" mỗi khi có người đọc danh sách trận —
        # xử lý lazy, giữ lại trạng thái riêng (không xóa) để còn lịch sử, theo đúng yêu cầu.
        Match.objects.filter(status=Match.CHO_XAC_NHAN, date__lt=timezone.localdate()).update(status=Match.HET_HAN)
        return super().get_queryset()

    @action(detail=False, methods=["post"], url_path="self-register")
    def self_register(self, request):
        """VĐV đã đăng nhập (và đã liên kết VĐV) tự đăng ký 1 trận Giao hữu — luôn là VĐV A, chọn đối
        thủ chính (VĐV B, người PHẢI xác nhận), và nếu Đánh đôi thì chọn thêm đồng đội của mình (VĐV A2,
        không cần xác nhận) + đối thủ thứ 2 (VĐV B2, cũng không cần xác nhận — chỉ VĐV B xác nhận)."""
        player = services.get_linked_player(request.user)
        if not player:
            raise PermissionDenied("Tài khoản của bạn chưa được gắn với VĐV nào nên không thể tự đăng ký.")
        serializer = FriendlySelfRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        opponent = d["opponent"]
        mode = d.get("mode", "don")
        teammate = d.get("teammate")
        opponent2 = d.get("opponent2")
        if opponent.id == player.id or (teammate and teammate.id == player.id):
            raise ValidationError("Không thể chọn chính mình làm đối thủ/đồng đội.")
        if mode == "doi":
            if not teammate or not opponent2:
                raise ValidationError("Đánh đôi cần chọn đủ đồng đội và đối thủ thứ 2.")
            ids = {player.id, teammate.id, opponent.id, opponent2.id}
            if len(ids) != 4:
                raise ValidationError("4 VĐV trong trận đôi phải khác nhau.")
        match = Match.objects.create(
            tournament=None, type=Match.GIAO_HUU, mode=mode, status=Match.CHO_XAC_NHAN,
            player_a=player, player_b=opponent,
            player_a2=teammate if mode == "doi" else None,
            player_b2=opponent2 if mode == "doi" else None,
            sets_a=None, sets_b=None, winner_side=None, delta_a=0, delta_b=0,
            date=d["date"], handicap_a=d.get("handicap_a", ""), handicap_b=d.get("handicap_b", ""),
        )
        return Response(MatchSerializer(match).data, status=201)

    def _require_confirming_player(self, request, match):
        player = services.get_linked_player(request.user)
        if not player or match.player_b_id != player.id:
            raise PermissionDenied("Bạn chỉ có thể xác nhận/từ chối trận đấu mà chính bạn là đối thủ được mời.")
        if match.date < timezone.localdate():
            if match.status == Match.CHO_XAC_NHAN:
                match.status = Match.HET_HAN
                match.save(update_fields=["status"])
            raise ValidationError("Trận đấu đã quá hạn xác nhận (đã qua ngày diễn ra).")
        if match.status != Match.CHO_XAC_NHAN:
            raise ValidationError("Trận đấu này không còn ở trạng thái chờ xác nhận.")

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        match = self.get_object()
        self._require_confirming_player(request, match)
        match.status = Match.SCHEDULED
        match.save(update_fields=["status"])
        return Response(MatchSerializer(match).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        match = self.get_object()
        self._require_confirming_player(request, match)
        match.status = Match.TU_CHOI
        match.save(update_fields=["status"])
        return Response(MatchSerializer(match).data)

    def create(self, request, *args, **kwargs):
        serializer = MatchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            match = services.record_match(
                tournament=d.get("tournament"),
                mode=d.get("mode", "don"),
                status=d.get("status", "completed"),
                stage=d.get("stage", ""),
                group=d.get("group"),
                player_a=d["player_a"],
                player_b=d["player_b"],
                player_a2=d.get("player_a2"),
                player_b2=d.get("player_b2"),
                sets_a=d.get("sets_a"),
                sets_b=d.get("sets_b"),
                date=d.get("date"),
                handicap_a=d.get("handicap_a", ""),
                handicap_b=d.get("handicap_b", ""),
            )
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(MatchSerializer(match).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        match = self.get_object()
        serializer = MatchUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            match = services.edit_match(
                match,
                player_a=d["player_a"], player_b=d["player_b"],
                player_a2=d.get("player_a2"), player_b2=d.get("player_b2"),
                sets_a=d.get("sets_a"), sets_b=d.get("sets_b"), date=d.get("date"),
            )
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(MatchSerializer(match).data)

    def destroy(self, request, *args, **kwargs):
        match = self.get_object()
        slot = getattr(match, "knockout_slot", None)
        if slot is not None:
            try:
                services.ensure_slot_editable(slot)
            except ValueError as e:
                raise ValidationError(str(e))
        services.delete_match(match)
        return Response(status=204)


class KnockoutSlotViewSet(viewsets.ReadOnlyModelViewSet):
    """Các ô của sơ đồ vòng loại trực tiếp — ai cũng xem được (giống matches/groups); mọi thay đổi
    đi qua 3 action dưới đây (không qua create/update thường), để luôn chạy qua đúng services."""
    queryset = KnockoutSlot.objects.select_related("tournament", "match", "bye_player", "bye_player2").all()
    serializer_class = KnockoutSlotSerializer
    permission_classes = [permissions.AllowAny]

    @action(detail=True, methods=["post"])
    def set_bye(self, request, pk=None):
        slot = self.get_object()
        occupied = bool(slot.match_id or slot.bye_player_id)
        _require_role(request, ["admin"] if occupied else ["admin", "manager", "scorer"])

        mode = request.data.get("mode", "don")
        if mode not in ("don", "doi"):
            raise ValidationError("Thể thức không hợp lệ.")
        player_id = request.data.get("player")
        if not player_id:
            raise ValidationError("Thiếu VĐV được miễn đấu (BYE).")
        player = Player.objects.filter(id=player_id).first()
        if not player:
            raise ValidationError("Không tìm thấy VĐV.")
        player2 = None
        if mode == "doi":
            player2_id = request.data.get("player2")
            player2 = Player.objects.filter(id=player2_id).first() if player2_id else None
            if not player2:
                raise ValidationError("Ô đánh đôi cần chọn đủ 2 VĐV cho bên miễn đấu.")

        try:
            services.set_slot_bye(slot, mode=mode, player=player, player2=player2)
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(KnockoutSlotSerializer(slot).data)

    @action(detail=True, methods=["post"])
    def set_match(self, request, pk=None):
        slot = self.get_object()
        occupied = bool(slot.match_id or slot.bye_player_id)
        _require_role(request, ["admin"] if occupied else ["admin", "manager", "scorer"])

        serializer = MatchCreateSerializer(data={**request.data, "tournament": slot.tournament_id, "stage": slot.stage_name, "group": None})
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            services.set_slot_match(
                slot, mode=d.get("mode", "don"), player_a=d["player_a"], player_b=d["player_b"],
                player_a2=d.get("player_a2"), player_b2=d.get("player_b2"),
                sets_a=d.get("sets_a"), sets_b=d.get("sets_b"), status=d.get("status", "completed"),
                handicap_a=d.get("handicap_a", ""), handicap_b=d.get("handicap_b", ""), date=d.get("date"),
            )
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(KnockoutSlotSerializer(slot).data)

    @action(detail=True, methods=["post"])
    def clear(self, request, pk=None):
        slot = self.get_object()
        _require_role(request, ["admin"])
        try:
            services.clear_slot(slot)
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(KnockoutSlotSerializer(slot).data)


class MatchMediaViewSet(viewsets.ModelViewSet):
    """Thư viện ảnh/video YouTube của từng trận đấu. Ai cũng xem được (giống matches); thêm mới
    cần Admin/Quản lý/Người nhập liệu (giống nhập kết quả trận), xóa chỉ Admin (an toàn hơn,
    cùng quy ước với xóa trận/xóa sơ đồ)."""
    queryset = MatchMedia.objects.select_related("match", "uploaded_by").all()
    serializer_class = MatchMediaSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAdminOnly()]
        if self.action == "create":
            return [IsAdminOrManagerOrScorer()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        qs = super().get_queryset()
        match_id = self.request.query_params.get("match")
        if match_id:
            qs = qs.filter(match_id=match_id)
        return qs

    def create(self, request, *args, **kwargs):
        match_id = request.data.get("match")
        match = Match.objects.filter(id=match_id).first()
        if not match:
            raise ValidationError("Không tìm thấy trận đấu.")
        media_type = request.data.get("media_type")
        caption = request.data.get("caption", "")
        try:
            if media_type == MatchMedia.PHOTO:
                image = request.FILES.get("image")
                if not image:
                    raise ValueError("Thiếu file ảnh.")
                media = services.add_match_photo(match, image=image, caption=caption, user=request.user)
            elif media_type == MatchMedia.YOUTUBE:
                youtube_url = request.data.get("youtube_url", "")
                media = services.add_match_youtube(match, youtube_url=youtube_url, caption=caption, user=request.user)
            else:
                raise ValueError("Loại media không hợp lệ (chỉ 'photo' hoặc 'youtube').")
        except (ValueError, DjangoValidationError) as e:
            msg = e.messages[0] if isinstance(e, DjangoValidationError) and getattr(e, "messages", None) else str(e)
            raise ValidationError(msg)
        return Response(MatchMediaSerializer(media).data, status=201)

    def destroy(self, request, *args, **kwargs):
        media = self.get_object()
        services.delete_match_media(media)
        return Response(status=204)


class ResultViewSet(viewsets.ModelViewSet):
    queryset = TournamentResult.objects.all()
    serializer_class = ResultSerializer
    permission_classes = [IsAdminOrManager]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def create(self, request, *args, **kwargs):
        serializer = ResultCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            if d["save_only"]:
                result = services.save_result_only(
                    tournament=d["tournament"], content_type=d["content_type"],
                    player=d["player"], teammates=d["teammates"], placement=d["placement"],
                )
            else:
                result = services.record_result(
                    tournament=d["tournament"], content_type=d["content_type"],
                    player=d["player"], teammates=d["teammates"], placement=d["placement"],
                )
                if result is None:
                    raise ValidationError("Giải giao hữu không áp dụng điểm thưởng thành tích.")
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(ResultSerializer(result).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        result = self.get_object()
        serializer = ResultUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        apply_bonus = (not d["save_only"]) if "save_only" in d else result.bonus_applied
        try:
            result = services.edit_result(
                result,
                content_type=d.get("content_type", result.content_type),
                placement=d.get("placement", result.placement),
                player=d.get("player", result.player),
                teammates=d.get("teammates", list(result.teammates.all())),
                apply_bonus=apply_bonus,
            )
        except ValueError as e:
            raise ValidationError(str(e))
        return Response(ResultSerializer(result).data)

    def destroy(self, request, *args, **kwargs):
        result = self.get_object()
        services.delete_result(result)
        return Response(status=204)


class GroupViewSet(viewsets.ModelViewSet):
    """Bảng đấu trong giải: ai cũng xem được; Admin/Quản lý Giải đấu được tạo/sửa/xóa."""
    queryset = TournamentGroup.objects.all().order_by("tournament", "name")
    serializer_class = GroupSerializer
    permission_classes = [IsAdminOrManager]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def destroy(self, request, *args, **kwargs):
        services.delete_group(self.get_object())
        return Response(status=204)


class PointHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PointHistory.objects.all().order_by("-created_at")
    serializer_class = PointHistorySerializer
    permission_classes = [permissions.AllowAny]


class TournamentWaitlistViewSet(viewsets.ModelViewSet):
    """Danh sách chờ đăng ký thi đấu — nút riêng ở thẻ giải đấu, AI CŨNG XEM ĐƯỢC (kể cả người dùng
    thường/chưa đăng nhập, giống matches/handicap-rules). Thêm (POST): Admin/Quản lý giải thêm cho
    bất kỳ VĐV nào (source="admin", không cần giải đang Mở đăng ký); VĐV tự đăng ký (source="self")
    cần đăng nhập + đã liên kết VĐV + giải đang ở trạng thái "Mở đăng ký", và chỉ được đăng ký cho
    chính mình. Sửa/Xóa (PATCH/DELETE) vẫn chỉ dành cho Admin/Quản lý giải."""
    queryset = TournamentWaitlist.objects.select_related("player", "tournament").all()
    serializer_class = TournamentWaitlistSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action == "create":
            return [permissions.IsAuthenticated()]
        if self.action in ("partial_update", "update", "destroy"):
            return [IsAdminOrManager()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        qs = super().get_queryset()
        tournament_id = self.request.query_params.get("tournament")
        if tournament_id:
            qs = qs.filter(tournament_id=tournament_id)
        return qs

    def perform_create(self, serializer):
        role = services.get_role(self.request.user)
        if role in ("admin", "manager"):
            serializer.save(source=TournamentWaitlist.ADMIN)
            return

        # VĐV tự đăng ký: chỉ cho chính mình, và chỉ khi giải đang Mở đăng ký.
        player = services.get_linked_player(self.request.user)
        if not player:
            raise PermissionDenied("Tài khoản của bạn chưa được gắn với VĐV nào nên không thể tự đăng ký.")
        chosen_player = serializer.validated_data.get("player")
        if chosen_player and chosen_player.id != player.id:
            raise PermissionDenied("Bạn chỉ có thể tự đăng ký cho chính mình.")
        tournament = serializer.validated_data.get("tournament")
        if not tournament or tournament.registration_status != Tournament.MO_DANG_KY:
            raise ValidationError("Giải đấu này hiện không mở đăng ký.")
        serializer.save(player=player, source=TournamentWaitlist.SELF, status=TournamentWaitlist.CHO)


class HandicapRuleViewSet(viewsets.ModelViewSet):
    """Quy tắc điểm chấp (tab "Điểm chấp" trong Quản lý điểm): ai cũng xem được (dùng để đề xuất
    điểm chấp ở giao diện nhập trận), chỉ Admin được thêm/sửa/xóa (giống Cấu hình chung)."""
    queryset = HandicapRule.objects.all().order_by("min_diff")
    serializer_class = HandicapRuleSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [IsAdminOnly()]


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminStrict])
def ranking_config_view(request):
    """Trang Quản lý điểm (chỉ Quản trị viên): xem/sửa quy tắc tính điểm của CLB."""
    cfg = RankingConfig.get_solo()
    if request.method == "PATCH":
        serializer = RankingConfigSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    return Response(RankingConfigSerializer(cfg).data)
