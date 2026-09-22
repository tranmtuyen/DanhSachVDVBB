from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from . import services
from .models import Match, Player, PointHistory, Tournament, TournamentResult
from .serializers import (
    MatchCreateSerializer, MatchSerializer, MatchUpdateSerializer, PlayerSerializer,
    PointHistorySerializer, ResultCreateSerializer, ResultSerializer,
    TournamentSerializer, UserSerializer,
)


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


# ================= Đăng nhập / đăng xuất / thông tin bản thân =================

@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login_view(request):
    username = request.data.get("username", "")
    password = request.data.get("password", "")
    user = authenticate(request, username=username, password=password)
    if not user:
        return Response({"detail": "Sai tên đăng nhập hoặc mật khẩu."}, status=400)
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
        new_rating = request.data.get("rating")
        if new_rating is None:
            raise ValidationError("Thiếu giá trị rating mới.")
        services.adjust_rating(player, new_rating)
        return Response(PlayerSerializer(player, context={"request": request}).data)


class TournamentViewSet(viewsets.ModelViewSet):
    queryset = Tournament.objects.all().order_by("-date")
    serializer_class = TournamentSerializer
    permission_classes = [IsAdminOrManager]

    def get_permissions(self):
        # Xóa giải đấu: chỉ Quản trị viên (vì sẽ hoàn tác điểm hàng loạt). Còn lại giữ nguyên như cũ.
        if self.action == "destroy":
            return [IsAdminOnly()]
        return [IsAdminOrManager()]

    def destroy(self, request, *args, **kwargs):
        tournament = self.get_object()
        services.delete_tournament(tournament)
        return Response(status=204)


class MatchViewSet(viewsets.ModelViewSet):
    queryset = Match.objects.all().order_by("-date")
    serializer_class = MatchSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        # Sửa/xóa trận đấu: chỉ Quản trị viên. Tạo trận mới: giữ nguyên như cũ (admin/manager/scorer).
        if self.action in ("partial_update", "destroy"):
            return [IsAdminOnly()]
        if self.action == "create":
            return [IsAdminOrManagerOrScorer()]
        return [permissions.AllowAny()]

    def create(self, request, *args, **kwargs):
        serializer = MatchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            match = services.record_match(
                tournament=d.get("tournament"),
                mode=d.get("mode", "don"),
                status=d.get("status", "completed"),
                player_a=d["player_a"],
                player_b=d["player_b"],
                player_a2=d.get("player_a2"),
                player_b2=d.get("player_b2"),
                sets_a=d.get("sets_a"),
                sets_b=d.get("sets_b"),
                date=d.get("date"),
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
        services.delete_match(match)
        return Response(status=204)


class ResultViewSet(viewsets.ModelViewSet):
    queryset = TournamentResult.objects.all()
    serializer_class = ResultSerializer
    permission_classes = [IsAdminOrManager]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        serializer = ResultCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        result = services.record_result(tournament=d["tournament"], player=d["player"], placement=d["placement"])
        if result is None:
            raise ValidationError("Giải giao hữu không áp dụng điểm thưởng thành tích.")
        return Response(ResultSerializer(result).data, status=201)


class PointHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PointHistory.objects.all().order_by("-created_at")
    serializer_class = PointHistorySerializer
    permission_classes = [permissions.AllowAny]
