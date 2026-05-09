
from django.db import models

class RoastingProfile(models.Model):
    batch_number = models.CharField(max_length=50, unique=True, verbose_name='批次号')
    green_bean = models.ForeignKey('beans.CoffeeBean', on_delete=models.CASCADE, verbose_name='生豆')
    input_weight = models.DecimalField(max_digits=10, decimal_places=2, verbose_name='入豆重量(g)')
    output_weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name='出豆重量(g)')
    roast_date = models.DateTimeField(verbose_name='烘焙日期')
    roaster_model = models.CharField(max_length=100, blank=True, verbose_name='烘焙机型号')
    roast_level = models.CharField(max_length=50, blank=True, verbose_name='烘焙度')

    charge_temp = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, verbose_name='入豆温度(℃)')
    dry_end_time = models.IntegerField(null=True, blank=True, verbose_name='脱水结束时间(秒)')
    dry_end_temp = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, verbose_name='脱水结束温度(℃)')
    fc_start_time = models.IntegerField(null=True, blank=True, verbose_name='一爆开始时间(秒)')
    fc_start_temp = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, verbose_name='一爆开始温度(℃)')
    fc_end_time = models.IntegerField(null=True, blank=True, verbose_name='一爆结束时间(秒)')
    fc_end_temp = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, verbose_name='一爆结束温度(℃)')
    sc_start_time = models.IntegerField(null=True, blank=True, verbose_name='二爆开始时间(秒)')
    sc_start_temp = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, verbose_name='二爆开始温度(℃)')
    drop_time = models.IntegerField(verbose_name='下豆时间(秒)')
    drop_temp = models.DecimalField(max_digits=6, decimal_places=2, verbose_name='下豆温度(℃)')

    notes = models.TextField(blank=True, verbose_name='烘焙笔记')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '烘焙记录'
        verbose_name_plural = '烘焙记录'
        ordering = ['-roast_date']

    def __str__(self):
        return f'{self.batch_number} - {self.green_bean.name}'

class TemperaturePoint(models.Model):
    roast_profile = models.ForeignKey(RoastingProfile, on_delete=models.CASCADE, related_name='temperature_points', verbose_name='烘焙曲线')
    time_seconds = models.IntegerField(verbose_name='时间(秒)')
    temperature = models.DecimalField(max_digits=6, decimal_places=2, verbose_name='温度(℃)')

    class Meta:
        verbose_name = '温度点'
        verbose_name_plural = '温度点'
        ordering = ['time_seconds']

    def __str__(self):
        return f'{self.roast_profile.batch_number} - {self.time_seconds}s: {self.temperature}℃'
