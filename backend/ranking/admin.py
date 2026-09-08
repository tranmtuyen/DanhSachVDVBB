from django import forms
from django.contrib import admin
from django.utils.html import format_html

from . import services
from .models import Match, Player, PointHistory, Tournament, TournamentResult


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ("photo_thumb", "name", "nickname", "hang", "rating", "birth_year", "join_date")
    list_display_links = ("photo_thumb", "name")
    search_fields = ("name", "nickname", "id_number")
    readonly_fields = ("join_date", "photo_preview")
    fields = ("name", "nickname", "photo", "photo_preview", "birth_year", "id_number", "rating", "join_date")

    def photo_thumb(self, obj):
        if obj.photo:
            return format_html('<img src="{}" style="height:32px;width:32px;border-radius:50%;object-fit:cover;" />', obj.photo.url)
        return "—"
    photo_thumb.short_description = "Ảnh"

    def photo_preview(self, obj):
        if obj.photo:
            return format_html('<img src="{}" style="height:120px;border-radius:8px;object-fit:cover;" />', obj.photo.url)
        return "Chưa có ảnh"
    photo_preview.short_description = "Xem trước ảnh"

    def hang(self, obj):
        return obj.hang
    hang.short_description = "Hạng"


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "date", "status")
    list_filter = ("type", "status")
    search_fields = ("name",)


class MatchAdminForm(forms.ModelForm):
    """Form nhập trận đấu — người dùng chỉ nhập tỷ số, hệ thống tự tính điểm."""
    class Meta:
        model = Match
        fields = ["tournament", "mode", "player_a", "player_b", "player_a2", "player_b2", "sets_a", "sets_b", "date"]

    def clean(self):
        cleaned = super().clean()
        mode = cleaned.get("mode")
        a, b = cleaned.get("player_a"), cleaned.get("player_b")
        a2, b2 = cleaned.get("player_a2"), cleaned.get("player_b2")
        sa, sb = cleaned.get("sets_a"), cleaned.get("sets_b")
        if sa is not None and sb is not None and sa == sb:
            raise forms.ValidationError("Tỷ số không thể hòa — phải có người thắng.")
        if mode == "doi":
            if not a2 or not b2:
                raise forms.ValidationError("Đánh đôi cần chọn đủ VĐV A2 và VĐV B2.")
            ids = {p.id for p in [a, a2, b, b2] if p}
            if len(ids) != 4:
                raise forms.ValidationError("4 VĐV trong trận đôi phải khác nhau.")
        else:
            if a and b and a == b:
                raise forms.ValidationError("VĐV A và VĐV B phải khác nhau.")
        return cleaned


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    form = MatchAdminForm
    list_display = ("date", "mode", "player_a", "sets_a", "sets_b", "player_b", "type", "delta_a", "delta_b")
    list_filter = ("type", "mode", "tournament")
    readonly_fields = ("type", "winner_side", "delta_a", "delta_b")

    def save_model(self, request, obj, form, change):
        d = form.cleaned_data
        if not change:
            services.record_match(
                tournament=d.get("tournament"),
                mode=d.get("mode", "don"),
                player_a=d["player_a"], player_b=d["player_b"],
                player_a2=d.get("player_a2"), player_b2=d.get("player_b2"),
                sets_a=d["sets_a"], sets_b=d["sets_b"], date=d.get("date"),
            )
        else:
            services.edit_match(
                obj,
                player_a=d["player_a"], player_b=d["player_b"],
                player_a2=d.get("player_a2"), player_b2=d.get("player_b2"),
                sets_a=d["sets_a"], sets_b=d["sets_b"], date=d.get("date"),
            )

    def delete_model(self, request, obj):
        services.delete_match(obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            services.delete_match(obj)


class ResultAdminForm(forms.ModelForm):
    class Meta:
        model = TournamentResult
        fields = ["tournament", "player", "placement"]


@admin.register(TournamentResult)
class TournamentResultAdmin(admin.ModelAdmin):
    form = ResultAdminForm
    list_display = ("tournament", "player", "placement", "bonus")
    readonly_fields = ("bonus",)

    def save_model(self, request, obj, form, change):
        if change:
            return
        services.record_result(tournament=obj.tournament, player=obj.player, placement=obj.placement)

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PointHistory)
class PointHistoryAdmin(admin.ModelAdmin):
    list_display = ("date", "player", "delta", "match_result", "match_score", "is_doubles", "reason")
    list_filter = ("player", "is_doubles")
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
