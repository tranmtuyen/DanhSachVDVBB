"""
LƯU Ý VỀ PHÂN QUYỀN:
Bản này chưa có màn hình đăng nhập ở frontend React, nên API đang để mở
(AllowAny) cho mọi thao tác, kể cả ghi — đúng bằng đúng mức độ "phân quyền
mô phỏng" của bản demo trước, chỉ khác là dữ liệu giờ nằm trong PostgreSQL thật.

Khi triển khai public, hãy:
1. Bật lại IsAdminOrManagerOrScorerOrReadOnly bên dưới cho từng ViewSet.
2. Thêm màn hình đăng nhập ở frontend (session hoặc token auth của DRF).
3. Gán user vào 1 trong 3 nhóm đã tạo sẵn: QuanTriVien, QuanLyGiaiDau, NguoiNhapLieu
   (xem lệnh `python manage.py setup_groups`).
"""
from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from . import services
from .models import Match, Player, PointHistory, Tournament, TournamentResult
from .serializers import (
    MatchCreateSerializer, MatchSerializer, MatchUpdateSerializer, PlayerSerializer,
    PointHistorySerializer, ResultCreateSerializer, ResultSerializer,
    TournamentSerializer,
)


class IsAdminOrManagerOrScorerOrReadOnly(permissions.BasePermission):
    """Sẵn sàng dùng khi có đăng nhập: ai cũng xem được, chỉnh sửa cần thuộc nhóm quyền."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_superuser:
            return True
        return user.groups.filter(name__in=["QuanTriVien", "QuanLyGiaiDau", "NguoiNhapLieu"]).exists()


class PlayerViewSet(viewsets.ModelViewSet):
    queryset = Player.objects.all().order_by("-rating")
    serializer_class = PlayerSerializer
    permission_classes = [permissions.AllowAny]


class TournamentViewSet(viewsets.ModelViewSet):
    queryset = Tournament.objects.all().order_by("-date")
    serializer_class = TournamentSerializer
    permission_classes = [permissions.AllowAny]


class MatchViewSet(viewsets.ModelViewSet):
    queryset = Match.objects.all().order_by("-date")
    serializer_class = MatchSerializer
    permission_classes = [permissions.AllowAny]
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
    permission_classes = [permissions.AllowAny]
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
