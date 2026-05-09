
from rest_framework import serializers
from .models import CuppingRecord

class CuppingRecordSerializer(serializers.ModelSerializer):
    roast_batch_number = serializers.SerializerMethodField()
    roast_bean_name = serializers.SerializerMethodField()

    class Meta:
        model = CuppingRecord
        fields = '__all__'

    def get_roast_batch_number(self, obj):
        return obj.roast_profile.batch_number if obj.roast_profile else None

    def get_roast_bean_name(self, obj):
        if obj.roast_profile and obj.roast_profile.green_bean:
            return obj.roast_profile.green_bean.name
        return None
