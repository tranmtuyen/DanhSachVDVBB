import re

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from . import services
from .models import KnockoutSlot, Match, MatchMedia, Player, PointHistory, RankingConfig, Tournament, TournamentGroup, TournamentResult


from rest_framework.fields import empty as DRF_EMPTY

HANDICAP_RE = re.compile(r"^\d{1,2}(-\d{1,2}){0,3}$")


def _clean_handicap(value):
    """Chuẩn hoá + kiểm tra định dạng điểm chấp (VD: '2-0-2'). Rỗng = không chấp điểm."""
    value = (value or "").strip()
    if value and not HANDICAP_RE.match(value):
        raise serializers.ValidationError("Điểm chấp chỉ được nhập dạng số cách nhau bởi dấu gạch ngang, ví dụ: 2-0-2.")
    return value


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    player_name = serializers.SerializerMethodField()
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    new_role = serializers.ChoiceField(choices=list(services.ROLE_GROUP.keys()), write_only=True, required=False)

    class Meta:
        model = User
        fields = ["id", "username", "email", "is_active", "role", "player", "player_name", "password", "new_role"]

    def get_role(self, obj):
        return services.get_role(obj)

    def get_player_name(self, obj):
        p = services.get_linked_player(obj)
        return p.name if p else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        p = services.get_linked_player(instance)
        data["player"] = p.id if p else None
        return data

    def validate_password(self, value):
        if value:
            try:
                validate_password(value)
            except DjangoValidationError as e:
                raise serializers.ValidationError(list(e.messages))
        return value

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        role = validated_data.pop("new_role", "user")
        player = validated_data.pop("player", None)
        validated_data.pop("password", None)
        with transaction.atomic():
            user = User(username=validated_data["username"], email=validated_data.get("email", ""))
            if password:
                user.set_password(password)
            user.save()
            self._apply_role(user, role)
            if player is not None:
                try:
                    services.set_linked_player(user, player)
                except ValueError as e:
                    raise serializers.ValidationError({"player": str(e)})
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        role = validated_data.pop("new_role", None)
        player = validated_data.pop("player", DRF_EMPTY)  # phân biệt "không gửi" và "gửi null để gỡ gắn"
        with transaction.atomic():
            instance.email = validated_data.get("email", instance.email)
            instance.is_active = validated_data.get("is_active", instance.is_active)
            if password:
                instance.set_password(password)
            instance.save()
            if role:
                self._apply_role(instance, role)
            if player is not DRF_EMPTY:
                try:
                    services.set_linked_player(instance, player)
                except ValueError as e:
                    raise serializers.ValidationError({"player": str(e)})
        return instance

    def _apply_role(self, user, role):
        from django.contrib.auth.models import Group
        user.groups.clear()
        group_name = services.ROLE_GROUP.get(role)
        if group_name:
            group, _ = Group.objects.get_or_create(name=group_name)
            user.groups.add(group)


class PlayerSerializer(serializers.ModelSerializer):
    hang = serializers.ReadOnlyField()

    class Meta:
        model = Player
        fields = ["id", "name", "nickname", "photo", "birth_year", "id_number", "rating", "hang", "join_date"]
        read_only_fields = ["join_date"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        role = services.get_role(getattr(request, "user", None)) if request else None
        if role != "admin":
            data.pop("id_number", None)
            data.pop("birth_year", None)
        return data


class PlayerPhotoSerializer(serializers.ModelSerializer):
    """Chỉ dùng cho việc tự đổi ảnh (endpoint /auth/my-photo/) — thừa hưởng validator giới hạn 1MB từ model."""
    class Meta:
        model = Player
        fields = ["photo"]


class TournamentSerializer(serializers.ModelSerializer):
    # Nếu không gửi "date_to" (hoặc gửi null): coi như giải 1 ngày — tự lấy bằng "date" (xem validate()).
    date_to = serializers.DateField(required=False, allow_null=True)
    # "status" luôn được TÍNH TỰ ĐỘNG từ ngày (xem Tournament.computed_status) — chỉ đọc, client
    # gửi "status" lên (nếu có) sẽ bị bỏ qua, không còn cách ép trạng thái thủ công qua API.
    status = serializers.SerializerMethodField()

    class Meta:
        model = Tournament
        fields = ["id", "name", "type", "date", "date_to", "status"]

    def get_status(self, obj):
        return obj.computed_status

    def validate(self, data):
        date = data.get("date", self.instance.date if self.instance else None)
        date_to = data.get("date_to", self.instance.date_to if self.instance else None)
        if not date_to:
            data["date_to"] = date
        elif date and date_to < date:
            raise serializers.ValidationError({"date_to": "“Đến ngày” không được trước “Từ ngày”."})
        return data


class MatchSerializer(serializers.ModelSerializer):
    # Tổng số ảnh/video đã gắn cho trận này — chỉ 1 số đếm nhẹ để hiển thị badge ngoài danh sách,
    # không kéo theo dữ liệu media đầy đủ (ảnh/link tải riêng khi mở thư viện). Dùng annotate ở
    # MatchViewSet.get_queryset để tránh N+1 query; fallback .count() nếu truy cập trực tiếp model.
    media_count = serializers.SerializerMethodField()

    class Meta:
        model = Match
        fields = ["id", "tournament", "type", "mode", "status", "stage", "group", "player_a", "player_b", "player_a2", "player_b2",
                  "sets_a", "sets_b", "winner_side", "delta_a", "delta_b", "handicap_a", "handicap_b", "date", "media_count"]
        read_only_fields = ["type", "winner_side", "delta_a", "delta_b"]

    def get_media_count(self, obj):
        return getattr(obj, "_media_count", None) if getattr(obj, "_media_count", None) is not None else obj.media_items.count()


class MatchMediaSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MatchMedia
        fields = [
            "id", "match", "media_type", "image", "youtube_url", "youtube_video_id",
            "caption", "order", "uploaded_by_name", "created_at",
        ]
        read_only_fields = ["youtube_video_id", "uploaded_by_name", "created_at"]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.username if obj.uploaded_by_id else None


class MatchCreateSerializer(serializers.Serializer):
    tournament = serializers.PrimaryKeyRelatedField(queryset=Tournament.objects.all(), required=False, allow_null=True)
    mode = serializers.ChoiceField(choices=Match.MODE_CHOICES, default="don")
    status = serializers.ChoiceField(choices=Match.STATUS_CHOICES, default="completed")
    # Chỉ "bang"/"ban_ket"/"chung_ket" có ý nghĩa đặc biệt (xem models.py) — ngoài ra là tên
    # vòng đấu tự do người dùng gõ (VD "Vòng 1/8", "Vòng 1/16", "Tranh hạng Ba"...).
    stage = serializers.CharField(required=False, allow_blank=True, default="", max_length=30, trim_whitespace=True)
    group = serializers.PrimaryKeyRelatedField(queryset=TournamentGroup.objects.all(), required=False, allow_null=True)
    player_a = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    player_b = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    player_a2 = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    player_b2 = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    sets_a = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sets_b = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    handicap_a = serializers.CharField(required=False, allow_blank=True, default="", max_length=20)
    handicap_b = serializers.CharField(required=False, allow_blank=True, default="", max_length=20)
    date = serializers.DateField(required=False)

    def validate_handicap_a(self, value):
        return _clean_handicap(value)

    def validate_handicap_b(self, value):
        return _clean_handicap(value)

    def validate(self, data):
        status = data.get("status", "completed")
        sets_a, sets_b = data.get("sets_a"), data.get("sets_b")
        if status == "completed":
            if sets_a is None or sets_b is None:
                raise serializers.ValidationError("Cần nhập tỷ số khi trận đấu đã kết thúc.")
            if sets_a == sets_b:
                raise serializers.ValidationError("Tỷ số không thể hòa.")
        if data.get("mode") == "doi":
            if not data.get("player_a2") or not data.get("player_b2"):
                raise serializers.ValidationError("Đánh đôi cần đủ 2 VĐV mỗi đội.")
            ids = {data["player_a"].id, data["player_a2"].id, data["player_b"].id, data["player_b2"].id}
            if len(ids) != 4:
                raise serializers.ValidationError("4 VĐV trong trận đôi phải khác nhau.")
        else:
            if data["player_a"] == data["player_b"]:
                raise serializers.ValidationError("VĐV A và VĐV B phải khác nhau.")

        stage, group, tournament = data.get("stage", ""), data.get("group"), data.get("tournament")
        if stage and not tournament:
            raise serializers.ValidationError("Chỉ trận trong giải đấu mới có giai đoạn/bảng.")
        if stage == "bang":
            if not group:
                raise serializers.ValidationError("Trận vòng bảng cần chọn bảng đấu.")
            if group.tournament_id != tournament.id:
                raise serializers.ValidationError("Bảng đấu không thuộc giải đấu này.")
            member_ids = set(group.players.values_list("id", flat=True))
            ids = [data["player_a"].id, data["player_b"].id]
            if data.get("mode") == "doi":
                ids += [data["player_a2"].id, data["player_b2"].id]
            if not set(ids) <= member_ids:
                raise serializers.ValidationError("Tất cả VĐV trong trận vòng bảng phải thuộc bảng đã chọn.")
        elif group:
            raise serializers.ValidationError("Chỉ trận vòng bảng mới thuộc 1 bảng đấu.")
        return data


class MatchUpdateSerializer(serializers.Serializer):
    player_a = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    player_b = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    player_a2 = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    player_b2 = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    sets_a = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sets_b = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    date = serializers.DateField(required=False)

    def validate(self, data):
        sets_a, sets_b = data.get("sets_a"), data.get("sets_b")
        if sets_a is not None and sets_b is not None and sets_a == sets_b:
            raise serializers.ValidationError("Tỷ số không thể hòa.")
        return data


class ResultSerializer(serializers.ModelSerializer):
    teammates = serializers.PrimaryKeyRelatedField(many=True, queryset=Player.objects.all(), required=False)

    class Meta:
        model = TournamentResult
        fields = ["id", "tournament", "content_type", "player", "teammates", "placement", "bonus", "bonus_applied"]
        read_only_fields = ["bonus", "bonus_applied"]


class ResultCreateSerializer(serializers.Serializer):
    tournament = serializers.PrimaryKeyRelatedField(queryset=Tournament.objects.all())
    content_type = serializers.ChoiceField(choices=TournamentResult.CONTENT_CHOICES, default="don")
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    teammates = serializers.PrimaryKeyRelatedField(many=True, queryset=Player.objects.all(), required=False, default=list)
    placement = serializers.ChoiceField(choices=TournamentResult.PLACEMENT_CHOICES)
    save_only = serializers.BooleanField(default=False)  # True = "Lưu thành tích" (không cộng điểm)


class ResultUpdateSerializer(serializers.Serializer):
    content_type = serializers.ChoiceField(choices=TournamentResult.CONTENT_CHOICES, required=False)
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False)
    teammates = serializers.PrimaryKeyRelatedField(many=True, queryset=Player.objects.all(), required=False)
    placement = serializers.ChoiceField(choices=TournamentResult.PLACEMENT_CHOICES, required=False)
    save_only = serializers.BooleanField(required=False)


class PointHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PointHistory
        fields = ["id", "player", "date", "before", "after", "delta", "reason",
                  "match", "result", "match_score", "match_result", "is_doubles"]


class RankingConfigSerializer(serializers.ModelSerializer):
    k_khong_chap = serializers.IntegerField(min_value=1, max_value=200)
    k_co_chap = serializers.IntegerField(min_value=1, max_value=200)
    k_giao_huu = serializers.IntegerField(min_value=1, max_value=200)
    bonus_vo_dich = serializers.IntegerField(min_value=0, max_value=1000)
    bonus_a_quan = serializers.IntegerField(min_value=0, max_value=1000)
    bonus_hang_ba = serializers.IntegerField(min_value=0, max_value=1000)
    bonus_tu_ket = serializers.IntegerField(min_value=0, max_value=1000)
    mult_khong_chap = serializers.FloatField(min_value=0, max_value=10)
    mult_co_chap = serializers.FloatField(min_value=0, max_value=10)

    class Meta:
        model = RankingConfig
        fields = [
            "k_khong_chap", "k_co_chap", "k_giao_huu",
            "bonus_vo_dich", "bonus_a_quan", "bonus_hang_ba", "bonus_tu_ket",
            "mult_khong_chap", "mult_co_chap", "updated_at",
        ]
        read_only_fields = ["updated_at"]


class KnockoutSlotSerializer(serializers.ModelSerializer):
    """1 ô trong sơ đồ vòng loại trực tiếp — chỉ đọc (mutate qua các action set_bye/set_match/clear
    ở KnockoutSlotViewSet, không qua create/update thường của ModelViewSet)."""
    match = MatchSerializer(read_only=True)
    bye_player_name = serializers.SerializerMethodField()
    bye_player2_name = serializers.SerializerMethodField()
    # Tên người/cặp đã THẮNG ô này (từ BYE hoặc trận đã hoàn tất) — để FE tự "điền sẵn" tên vào ô
    # vòng sau mà không cần gọi thêm API nào khác (suy ra hoàn toàn từ danh sách đã tải).
    winner_player_id = serializers.SerializerMethodField()
    winner_player2_id = serializers.SerializerMethodField()
    winner_name = serializers.SerializerMethodField()
    winner_name2 = serializers.SerializerMethodField()
    # true nếu KHÔNG được sửa/xóa ô này nữa vì vòng sau đã có trận hoàn tất dựa trên kết quả ô này.
    locked = serializers.SerializerMethodField()

    class Meta:
        model = KnockoutSlot
        fields = [
            "id", "tournament", "round_no", "slot_index", "stage_name", "mode", "match",
            "bye_player", "bye_player_name", "bye_player2", "bye_player2_name",
            "winner_player_id", "winner_player2_id", "winner_name", "winner_name2", "locked",
        ]

    def get_bye_player_name(self, obj):
        return obj.bye_player.name if obj.bye_player_id else None

    def get_bye_player2_name(self, obj):
        return obj.bye_player2.name if obj.bye_player2_id else None

    def get_winner_player_id(self, obj):
        w = obj.winner
        return w[0].id if w and w[0] else None

    def get_winner_player2_id(self, obj):
        w = obj.winner
        return w[1].id if w and w[1] else None

    def get_winner_name(self, obj):
        w = obj.winner
        return w[0].name if w and w[0] else None

    def get_winner_name2(self, obj):
        w = obj.winner
        return w[1].name if w and w[1] else None

    def get_locked(self, obj):
        nxt = obj.next_slot()
        return bool(nxt and nxt.match_id and nxt.match.status == "completed")


class GroupSerializer(serializers.ModelSerializer):
    players = serializers.PrimaryKeyRelatedField(many=True, queryset=Player.objects.all(), required=False)

    class Meta:
        model = TournamentGroup
        fields = ["id", "tournament", "name", "players"]
        validators = []  # dùng thông báo kiểm tra trùng tên bằng tiếng Việt ở validate() bên dưới

    def validate(self, data):
        tournament = data.get("tournament") or (self.instance.tournament if self.instance else None)
        name = data.get("name", self.instance.name if self.instance else None)
        if name is not None:
            dup = TournamentGroup.objects.filter(tournament=tournament, name=name)
            if self.instance:
                dup = dup.exclude(pk=self.instance.pk)
            if dup.exists():
                raise serializers.ValidationError("Giải đấu này đã có bảng trùng tên.")
        players = data.get("players")
        if players:
            others = TournamentGroup.objects.filter(tournament=tournament, players__in=players)
            if self.instance:
                others = others.exclude(pk=self.instance.pk)
            if others.exists():
                raise serializers.ValidationError("Có VĐV đã thuộc bảng khác trong cùng giải đấu.")
        return data
