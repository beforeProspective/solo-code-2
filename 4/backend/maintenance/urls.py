
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoasterViewSet, MaintenanceRecordViewSet

router = DefaultRouter()
router.register(r'roasters', RoasterViewSet)
router.register(r'records', MaintenanceRecordViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
