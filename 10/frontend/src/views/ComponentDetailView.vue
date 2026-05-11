<template>
  <div class="component-detail-view">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ component?.name }}</h2>
        <p v-if="component?.part_number">{{ component.part_number }}</p>
      </div>
      <div class="page-actions">
        <Button 
          label="返回" 
          icon="pi pi-arrow-left" 
          severity="secondary" 
          @click="router.back()"
        />
        <Button 
          v-if="component?.datasheet_url" 
          label="数据手册" 
          icon="pi pi-book" 
          @click="openDatasheet"
        />
        <Button 
          label="编辑" 
          icon="pi pi-pencil" 
          severity="warning"
          @click="editComponent"
        />
      </div>
    </div>
    
    <div v-if="loading" class="loading">
      <i class="pi pi-spin pi-spinner"></i>
    </div>
    
    <div v-else-if="component" class="detail-content">
      <div class="detail-grid">
        <Card class="info-card">
          <template #title>基本信息</template>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">类别</span>
              <Tag :value="component.category" severity="info" />
            </div>
            <div class="info-item">
              <span class="info-label">封装</span>
              <span>{{ component.package || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">值</span>
              <span>{{ component.value || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">容差</span>
              <span>{{ component.tolerance || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">耐压</span>
              <span>{{ component.voltage_rating || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">功率</span>
              <span>{{ component.power_rating || '-' }}</span>
            </div>
          </div>
          <div class="info-item full-width" v-if="component.description">
            <span class="info-label">描述</span>
            <p>{{ component.description }}</p>
          </div>
        </Card>
        
        <Card class="info-card">
          <template #title>库存信息</template>
          <div class="stock-summary">
            <div class="stock-item">
              <span class="stock-label">当前库存</span>
              <Tag 
                :value="component.quantity || 0" 
                :severity="component.low_stock ? 'danger' : 'success'" 
                size="large"
              />
            </div>
            <div class="stock-item">
              <span class="stock-label">最低库存</span>
              <span class="stock-value">{{ component.min_stock || 0 }}</span>
            </div>
            <div class="stock-item" v-if="component.low_stock">
              <Tag value="低库存警告" severity="danger" />
            </div>
          </div>
          <Divider />
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">供应商</span>
              <span>{{ component.supplier_name || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">单价</span>
              <span>¥{{ component.unit_price?.toFixed(2) || '-' }}</span>
            </div>
            <div class="info-item full-width">
              <span class="info-label">存放位置</span>
              <span>{{ component.location || '-' }}</span>
            </div>
          </div>
        </Card>
      </div>
      
      <Card>
        <template #title>数据手册</template>
        <div v-if="component.datasheet_url" class="datasheet-info">
          <i class="pi pi-file-pdf" style="font-size: 2rem; color: #f44336;"></i>
          <div>
            <a :href="component.datasheet_url" target="_blank">{{ component.datasheet_url }}</a>
            <p style="color: #666; font-size: 0.875rem;">点击在新窗口打开</p>
          </div>
        </div>
        <div v-else class="text-gray">
          暂无数据手册
        </div>
      </Card>
    </div>
    
    <Toast />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { componentApi } from '@/api'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Divider from 'primevue/divider'
import Toast from 'primevue/toast'

const router = useRouter()
const route = useRoute()
const toast = useToast()

const component = ref(null)
const loading = ref(true)

const loadComponent = async () => {
  loading.value = true
  try {
    const response = await componentApi.getById(route.params.id)
    component.value = response.data.data
  } catch (error) {
    toast.add({ severity: 'error', summary: '加载失败', detail: '无法加载元件信息' })
  } finally {
    loading.value = false
  }
}

const openDatasheet = () => {
  if (component.value?.datasheet_url) {
    window.open(component.value.datasheet_url, '_blank')
  }
}

const editComponent = () => {
  router.push(`/components/${route.params.id}/edit`)
}

onMounted(() => {
  loadComponent()
})
</script>

<style scoped>
.component-detail-view {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-title {
  margin: 0;
  color: #333;
  font-size: 1.75rem;
}

.page-header p {
  margin: 0.25rem 0 0;
  color: #666;
}

.page-actions {
  display: flex;
  gap: 0.75rem;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem;
  font-size: 2rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.info-card {
  height: fit-content;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: 0.875rem;
  color: #666;
  font-weight: 500;
}

.stock-summary {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.stock-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.stock-label {
  font-size: 0.875rem;
  color: #666;
}

.stock-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #333;
}

.datasheet-info {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.datasheet-info a {
  color: #2196f3;
  text-decoration: none;
}

.datasheet-info a:hover {
  text-decoration: underline;
}

.text-gray {
  color: #999;
}
</style>
