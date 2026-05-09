
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from .models import RoastingProfile
from .serializers import RoastingProfileSerializer

class RoastingProfileViewSet(viewsets.ModelViewSet):
    queryset = RoastingProfile.objects.all()
    serializer_class = RoastingProfileSerializer

    @action(detail=False, methods=['get'])
    def by_bean(self, request):
        bean_id = request.query_params.get('bean_id')
        if bean_id:
            profiles = RoastingProfile.objects.filter(green_bean_id=bean_id)
            serializer = self.get_serializer(profiles, many=True)
            return Response(serializer.data)
        return Response([])

    @action(detail=False, methods=['get'])
    def search(self, request):
        query = request.query_params.get('q', '')
        profiles = RoastingProfile.objects.filter(
            Q(batch_number__icontains=query) |
            Q(roast_level__icontains=query)
        )
        serializer = self.get_serializer(profiles, many=True)
        return Response(serializer.data)
