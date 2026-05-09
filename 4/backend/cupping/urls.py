
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CuppingRecordViewSet

router = DefaultRouter()
router.register(r'', CuppingRecordViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
