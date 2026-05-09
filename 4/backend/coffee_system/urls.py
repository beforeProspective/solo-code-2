
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/beans/', include('beans.urls')),
    path('api/roasting/', include('roasting.urls')),
    path('api/cupping/', include('cupping.urls')),
    path('api/suppliers/', include('suppliers.urls')),
    path('api/maintenance/', include('maintenance.urls')),
    path('api/comparison/', include('comparison.urls')),
]
