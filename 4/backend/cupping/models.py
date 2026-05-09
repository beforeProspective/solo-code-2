
from django.db import models

class CuppingRecord(models.Model):
    roast_profile = models.ForeignKey('roasting.RoastingProfile', on_delete=models.CASCADE, verbose_name='烘焙批次')
    cupping_date = models.DateTimeField(verbose_name='杯测日期')
    cupper = models.CharField(max_length=100, blank=True, verbose_name='杯测师')

    aroma = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='香气')
    flavor = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='风味')
    aftertaste = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='余韵')
    acidity = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='酸度')
    body = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='醇厚度')
    balance = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='平衡感')
    uniformity = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='一致性')
    clean_cup = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='干净度')
    sweetness = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='甜感')
    overall = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, verbose_name='综合评价')
    total_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='总分')

    brew_method = models.CharField(max_length=100, blank=True, verbose_name='冲煮方式')
    brew_ratio = models.CharField(max_length=50, blank=True, verbose_name='粉水比')
    grind_size = models.CharField(max_length=100, blank=True, verbose_name='研磨度')
    water_temp = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='水温(℃)')
    brew_time = models.CharField(max_length=50, blank=True, verbose_name='冲煮时间')

    flavor_notes = models.TextField(blank=True, verbose_name='风味描述')
    notes = models.TextField(blank=True, verbose_name='备注')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '杯测记录'
        verbose_name_plural = '杯测记录'
        ordering = ['-cupping_date']

    def __str__(self):
        return f'{self.roast_profile.batch_number} - {self.cupping_date}'

    def save(self, *args, **kwargs):
        scores = [
            self.aroma, self.flavor, self.aftertaste, self.acidity,
            self.body, self.balance, self.uniformity, self.clean_cup,
            self.sweetness, self.overall
        ]
        valid_scores = [s for s in scores if s is not None]
        if valid_scores:
            self.total_score = sum(valid_scores)
        super().save(*args, **kwargs)
