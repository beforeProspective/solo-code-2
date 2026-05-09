
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CoffeeBeanViewSet

router = DefaultRouter()
router.register(r'', CoffeeBeanViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
