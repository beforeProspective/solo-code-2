
from django.db import models

class Roaster(models.Model):
    name = models.CharField(max_length=200, verbose_name='烘焙机名称')
    model = models.CharField(max_length=100, blank=True, verbose_name='型号')
    brand = models.CharField(max_length=100, blank=True, verbose_name='品牌')
    capacity = models.CharField(max_length=100, blank=True, verbose_name='容量')
    purchase_date = models.DateField(null=True, blank=True, verbose_name='购买日期')
    serial_number = models.CharField(max_length=200, blank=True, verbose_name='序列号')
    notes = models.TextField(blank=True, verbose_name='备注')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '烘焙机'
        verbose_name_plural = '烘焙机'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.model})'

class MaintenanceRecord(models.Model):
    MAINTENANCE_TYPES = (
        ('cleaning', '清洁'),
        ('calibration', '校准'),
        ('repair', '维修'),
        ('inspection', '检查'),
        ('replacement', '零件更换'),
        ('other', '其他'),
    )

    roaster = models.ForeignKey(Roaster, on_delete=models.CASCADE, verbose_name='烘焙机')
    maintenance_type = models.CharField(max_length=50, choices=MAINTENANCE_TYPES, verbose_name='维护类型')
    maintenance_date = models.DateTimeField(verbose_name='维护日期')
    technician = models.CharField(max_length=100, blank=True, verbose_name='技术员')
    description = models.TextField(verbose_name='维护描述')
    parts_replaced = models.TextField(blank=True, verbose_name='更换零件')
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name='费用(元)')
    next_maintenance_date = models.DateField(null=True, blank=True, verbose_name='下次维护日期')
    notes = models.TextField(blank=True, verbose_name='备注')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '维护记录'
        verbose_name_plural = '维护记录'
        ordering = ['-maintenance_date']

    def __str__(self):
        return f'{self.roaster.name} - {self.get_maintenance_type_display()}'
