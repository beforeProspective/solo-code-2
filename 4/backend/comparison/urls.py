
from django.urls import path
from .views import RoastComparisonView

urlpatterns = [
    path('roasts/', RoastComparisonView.as_view(), name='roast-comparison'),
]
