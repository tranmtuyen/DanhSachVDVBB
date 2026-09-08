from rest_framework.routers import DefaultRouter

from .views import MatchViewSet, PlayerViewSet, PointHistoryViewSet, ResultViewSet, TournamentViewSet

router = DefaultRouter()
router.register("players", PlayerViewSet)
router.register("tournaments", TournamentViewSet)
router.register("matches", MatchViewSet)
router.register("results", ResultViewSet)
router.register("history", PointHistoryViewSet)

urlpatterns = router.urls
