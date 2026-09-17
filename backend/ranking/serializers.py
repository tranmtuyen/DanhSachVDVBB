from django.contrib.auth.models import User
from rest_framework import serializers

from . import services
from .models import Match, Player, PointHistory, Tournament, TournamentResult


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    new_role = serializers.ChoiceField(choices=list(services.ROLE_GROUP.keys()), write_only=True, required=False)

    class Meta:
        model = User
        fields = ["id", "username", "email", "is_active", "role", "password", "new_role"]

    def get_role(self, obj):
        return services.get_role(obj)

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        role = validated_data.pop("new_role", "user")
        validated_data.pop("password", None)
        user = User(username=validated_data["username"], email=validated_data.get("email", ""))
        if password:
            user.set_password(password)
        user.save()
        self._apply_role(user, role)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        role = validated_data.pop("new_role", None)
        instance.email = validated_data.get("email", instance.email)
        instance.is_active = validated_data.get("is_active", instance.is_active)
        if password:
            instance.set_password(password)
        instance.save()
        if role:
            self._apply_role(instance, role)
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


class TournamentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tournament
        fields = ["id", "name", "type", "date", "status"]


class MatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Match
        fields = ["id", "tournament", "type", "mode", "status", "player_a", "player_b", "player_a2", "player_b2",
                  "sets_a", "sets_b", "winner_side", "delta_a", "delta_b", "date"]
        read_only_fields = ["type", "winner_side", "delta_a", "delta_b"]


class MatchCreateSerializer(serializers.Serializer):
    tournament = serializers.PrimaryKeyRelatedField(queryset=Tournament.objects.all(), required=False, allow_null=True)
    mode = serializers.ChoiceField(choices=Match.MODE_CHOICES, default="don")
    status = serializers.ChoiceField(choices=Match.STATUS_CHOICES, default="completed")
    player_a = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    player_b = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    player_a2 = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    player_b2 = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    sets_a = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sets_b = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    date = serializers.DateField(required=False)

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
    class Meta:
        model = TournamentResult
        fields = ["id", "tournament", "player", "placement", "bonus"]
        read_only_fields = ["bonus"]


class ResultCreateSerializer(serializers.Serializer):
    tournament = serializers.PrimaryKeyRelatedField(queryset=Tournament.objects.all())
    player = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    placement = serializers.ChoiceField(choices=TournamentResult.PLACEMENT_CHOICES)


class PointHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PointHistory
        fields = ["id", "player", "date", "before", "after", "delta", "reason",
                  "match", "result", "match_score", "match_result", "is_doubles"]
