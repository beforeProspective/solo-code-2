
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Supplier
from .serializers import SupplierSerializer

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer

    @action(detail=False, methods=['get'])
    def top_rated(self, request):
        suppliers = Supplier.objects.filter(rating__gte=4).order_by('-rating')
        serializer = self.get_serializer(suppliers, many=True)
        return Response(serializer.data)
