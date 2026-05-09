
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import CuppingRecord
from .serializers import CuppingRecordSerializer

class CuppingRecordViewSet(viewsets.ModelViewSet):
    queryset = CuppingRecord.objects.all()
    serializer_class = CuppingRecordSerializer

    @action(detail=False, methods=['get'])
    def by_roast(self, request):
        roast_id = request.query_params.get('roast_id')
        if roast_id:
            records = CuppingRecord.objects.filter(roast_profile_id=roast_id)
            serializer = self.get_serializer(records, many=True)
            return Response(serializer.data)
        return Response([])

    @action(detail=False, methods=['get'])
    def top_scores(self, request):
        records = CuppingRecord.objects.filter(total_score__gte=80).order_by('-total_score')[:10]
        serializer = self.get_serializer(records, many=True)
        return Response(serializer.data)
