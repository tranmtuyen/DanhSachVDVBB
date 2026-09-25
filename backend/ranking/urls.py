from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MatchViewSet, PlayerViewSet, PointHistoryViewSet, ResultViewSet,
    TournamentViewSet, UserViewSet, change_password_view, login_view, logout_view, me_view,
    ranking_config_view, update_my_photo_view,
)

router = DefaultRouter()
router.register("players", PlayerViewSet)
router.register("tournaments", TournamentViewSet)
router.register("matches", MatchViewSet)
router.register("results", ResultViewSet)
router.register("history", PointHistoryViewSet)
router.register("users", UserViewSet)

urlpatterns = [
    path("auth/login/", login_view),
    path("auth/logout/", logout_view),
    path("auth/me/", me_view),
    path("auth/change-password/", change_password_view),
    path("auth/my-photo/", update_my_photo_view),
    path("ranking-config/", ranking_config_view),
] + router.urls
