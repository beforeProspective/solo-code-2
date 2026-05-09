
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from roasting.models import RoastingProfile, TemperaturePoint
from cupping.models import CuppingRecord
from roasting.serializers import RoastingProfileSerializer
from cupping.serializers import CuppingRecordSerializer

class RoastComparisonView(APIView):
    def get(self, request):
        batch_ids = request.query_params.getlist('batch_ids')
        if not batch_ids:
            batch_ids = request.query_params.getlist('batch_ids[]')
        if not batch_ids or len(batch_ids) < 2:
            return Response(
                {'error': '请至少选择2个批次进行对比'},
                status=status.HTTP_400_BAD_REQUEST
            )

        profiles = RoastingProfile.objects.filter(id__in=batch_ids)
        if len(profiles) < 2:
            return Response(
                {'error': '未找到足够的批次数据'},
                status=status.HTTP_404_NOT_FOUND
            )

        profile_data = []
        for profile in profiles:
            temp_points = TemperaturePoint.objects.filter(
                roast_profile=profile
            ).values('time_seconds', 'temperature')

            cupping_records = CuppingRecord.objects.filter(roast_profile=profile)
            cupping_data = CuppingRecordSerializer(cupping_records, many=True).data

            profile_data.append({
                'profile': RoastingProfileSerializer(profile).data,
                'temperature_points': list(temp_points),
                'cupping_records': cupping_data
            })

        return Response({
            'count': len(profiles),
            'data': profile_data
        })
