
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import CoffeeBean
from .serializers import CoffeeBeanSerializer

class CoffeeBeanViewSet(viewsets.ModelViewSet):
    queryset = CoffeeBean.objects.all()
    serializer_class = CoffeeBeanSerializer

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        beans = CoffeeBean.objects.filter(remaining_weight__lte=1)
        serializer = self.get_serializer(beans, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def search(self, request):
        query = request.query_params.get('q', '')
        beans = CoffeeBean.objects.filter(name__icontains=query) | \
                CoffeeBean.objects.filter(origin_country__icontains=query)
        serializer = self.get_serializer(beans, many=True)
        return Response(serializer.data)
