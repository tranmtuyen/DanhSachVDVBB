from django.contrib.auth import authenticate
from django.contrib.auth.models import User
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
    return Response({"token": token.key, "username": user.username, "role": services.get_role(user)})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def logout_view(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=204)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def me_view(request):
    return Response({"username": request.user.username, "role": services.get_role(request.user)})


# ================= Quản lý User (chỉ Quản trị viên) =================

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = UserSerializer
    permission_classes = [IsAdminOnly]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


class PlayerViewSet(viewsets.ModelViewSet):
    queryset = Player.objects.all().order_by("-rating")
    serializer_class = PlayerSerializer
    permission_classes = [IsAdminOnly]

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


class MatchViewSet(viewsets.ModelViewSet):
    queryset = Match.objects.all().order_by("-date")
    serializer_class = MatchSerializer
    permission_classes = [IsAdminOrManagerOrScorer]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def create(self, request, *args, **kwargs):
        serializer = MatchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            match = services.record_match(
                tournament=d.get("tournament"),
                mode=d.get("mode", "don"),
                player_a=d["player_a"],
                player_b=d["player_b"],
                player_a2=d.get("player_a2"),
                player_b2=d.get("player_b2"),
                sets_a=d["sets_a"],
                sets_b=d["sets_b"],
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
                sets_a=d["sets_a"], sets_b=d["sets_b"], date=d.get("date"),
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
