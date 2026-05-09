
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from .models import Roaster, MaintenanceRecord
from .serializers import RoasterSerializer, MaintenanceRecordSerializer

class RoasterViewSet(viewsets.ModelViewSet):
    queryset = Roaster.objects.all()
    serializer_class = RoasterSerializer

    @action(detail=False, methods=['get'])
    def search(self, request):
        query = request.query_params.get('q', '')
        roasters = Roaster.objects.filter(
            Q(name__icontains=query) |
            Q(model__icontains=query)
        )
        serializer = self.get_serializer(roasters, many=True)
        return Response(serializer.data)

class MaintenanceRecordViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRecord.objects.all()
    serializer_class = MaintenanceRecordSerializer

    @action(detail=False, methods=['get'])
    def by_roaster(self, request):
        roaster_id = request.query_params.get('roaster_id')
        if roaster_id:
            records = MaintenanceRecord.objects.filter(roaster_id=roaster_id)
            serializer = self.get_serializer(records, many=True)
            return Response(serializer.data)
        return Response([])

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        from datetime import date
        records = MaintenanceRecord.objects.filter(
            next_maintenance_date__gte=date.today()
        ).order_by('next_maintenance_date')
        serializer = self.get_serializer(records, many=True)
        return Response(serializer.data)
