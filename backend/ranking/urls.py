from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MatchViewSet, PlayerViewSet, PointHistoryViewSet, ResultViewSet,
    TournamentViewSet, UserViewSet, login_view, logout_view, me_view,
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
] + router.urls
