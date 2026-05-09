
from django.db import models

class Supplier(models.Model):
    name = models.CharField(max_length=200, verbose_name='供应商名称')
    contact_person = models.CharField(max_length=100, blank=True, verbose_name='联系人')
    phone = models.CharField(max_length=50, blank=True, verbose_name='电话')
    email = models.EmailField(blank=True, verbose_name='邮箱')
    address = models.TextField(blank=True, verbose_name='地址')
    website = models.URLField(blank=True, verbose_name='网站')
    rating = models.IntegerField(null=True, blank=True, verbose_name='评分(1-5)')
    notes = models.TextField(blank=True, verbose_name='备注')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        verbose_name = '供应商'
        verbose_name_plural = '供应商'
        ordering = ['-created_at']

    def __str__(self):
        return self.name
