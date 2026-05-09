
from rest_framework import serializers
from .models import RoastingProfile, TemperaturePoint

class TemperaturePointSerializer(serializers.ModelSerializer):
    class Meta:
        model = TemperaturePoint
        fields = ['id', 'time_seconds', 'temperature']

class RoastingProfileSerializer(serializers.ModelSerializer):
    temperature_points = TemperaturePointSerializer(many=True, required=False)
    green_bean_name = serializers.SerializerMethodField()
    weight_loss = serializers.SerializerMethodField()

    class Meta:
        model = RoastingProfile
        fields = '__all__'

    def get_green_bean_name(self, obj):
        return obj.green_bean.name if obj.green_bean else None

    def get_weight_loss(self, obj):
        if obj.input_weight and obj.output_weight:
            loss = obj.input_weight - obj.output_weight
            return round((loss / obj.input_weight) * 100, 2)
        return None

    def create(self, validated_data):
        temperature_points_data = validated_data.pop('temperature_points', [])
        profile = RoastingProfile.objects.create(**validated_data)
        for tp_data in temperature_points_data:
            TemperaturePoint.objects.create(roast_profile=profile, **tp_data)
        return profile

    def update(self, instance, validated_data):
        temperature_points_data = validated_data.pop('temperature_points', [])
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        if temperature_points_data:
            instance.temperature_points.all().delete()
            for tp_data in temperature_points_data:
                TemperaturePoint.objects.create(roast_profile=instance, **tp_data)
        return instance
