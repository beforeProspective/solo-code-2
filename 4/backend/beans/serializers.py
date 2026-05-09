
from rest_framework import serializers
from .models import CoffeeBean

class CoffeeBeanSerializer(serializers.ModelSerializer):
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = CoffeeBean
        fields = '__all__'

    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None
