from rest_framework import serializers

from .models import Match, Player, PointHistory, Tournament, TournamentResult


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
        fields = ["id", "tournament", "type", "mode", "player_a", "player_b", "player_a2", "player_b2",
                  "sets_a", "sets_b", "winner_side", "delta_a", "delta_b", "date"]
        read_only_fields = ["type", "winner_side", "delta_a", "delta_b"]


class MatchCreateSerializer(serializers.Serializer):
    tournament = serializers.PrimaryKeyRelatedField(queryset=Tournament.objects.all(), required=False, allow_null=True)
    mode = serializers.ChoiceField(choices=Match.MODE_CHOICES, default="don")
    player_a = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    player_b = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all())
    player_a2 = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    player_b2 = serializers.PrimaryKeyRelatedField(queryset=Player.objects.all(), required=False, allow_null=True)
    sets_a = serializers.IntegerField(min_value=0)
    sets_b = serializers.IntegerField(min_value=0)
    date = serializers.DateField(required=False)

    def validate(self, data):
        if data["sets_a"] == data["sets_b"]:
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
    sets_a = serializers.IntegerField(min_value=0)
    sets_b = serializers.IntegerField(min_value=0)
    date = serializers.DateField(required=False)

    def validate(self, data):
        if data["sets_a"] == data["sets_b"]:
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
                  "match", "match_score", "match_result", "is_doubles"]
