
from django.db import models

class CoffeeBean(models.Model):
    name = models.CharField(max_length=200, verbose_name='生豆名称')
    origin_country = models.CharField(max_length=100, verbose_name='原产国')
    region = models.CharField(max_length=100, blank=True, verbose_name='产区')
    farm = models.CharField(max_length=200, blank=True, verbose_name='庄园')
    altitude = models.CharField(max_length=100, blank=True, verbose_name='海拔')
    variety = models.CharField(max_length=100, blank=True, verbose_name='品种')
    process_method = models.CharField(max_length=100, blank=True, verbose_name='处理法')
    cupping_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='杯测分数')
    supplier = models.ForeignKey('suppliers.Supplier', on_delete=models.SET_NULL, null=True, blank=True, verbose_name='供应商')
    purchase_date = models.DateField(null=True, blank=True, verbose_name='采购日期')
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name='单价(元/kg)')
    total_weight = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='总重量(kg)')
    remaining_weight = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='剩余重量(kg)')
    notes = models.TextField(blank=True, verbose_name='备注')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '生豆库存'
        verbose_name_plural = '生豆库存'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} - {self.origin_country}'
