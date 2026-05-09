
from rest_framework import serializers
from .models import Roaster, MaintenanceRecord

class RoasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Roaster
        fields = '__all__'

class MaintenanceRecordSerializer(serializers.ModelSerializer):
    roaster_name = serializers.SerializerMethodField()
    maintenance_type_display = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceRecord
        fields = '__all__'

    def get_roaster_name(self, obj):
        return obj.roaster.name if obj.roaster else None

    def get_maintenance_type_display(self, obj):
        return obj.get_maintenance_type_display()
