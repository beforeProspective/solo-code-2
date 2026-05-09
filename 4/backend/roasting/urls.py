
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoastingProfileViewSet

router = DefaultRouter()
router.register(r'', RoastingProfileViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
