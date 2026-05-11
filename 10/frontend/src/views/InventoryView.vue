<template>
  <div class="inventory-view">
    <h2 class="page-title">库存概览</h2>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: #e3f2fd;">
          <i class="pi pi-box" style="color: #2196f3;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_inventory || 0 }}</div>
          <div class="stat-label">总库存数量</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #fff3e0;">
          <i class="pi pi-dollar" style="color: #ff9800;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">¥{{ stats.inventory_value?.toFixed(2) || '0.00' }}</div>
          <div class="stat-label">库存总价值</div>
        </div>
      </div>
      <div class="stat-card" :class="{ 'warning': stats.low_stock_count > 0 }">
        <div class="stat-icon" :style="{ background: stats.low_stock_count > 0 ? '#ffebee' : '#f3e5f5' }">
          <i class="pi pi-exclamation-triangle" :style="{ color: stats.low_stock_count > 0 ? '#f44336' : '#9c27b0' }"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.low_stock_count || 0 }}</div>
          <div class="stat-label">低库存项目</div>
        </div>
      </div>
    </div>
    
    <div class="cards-section">
      <Card>
        <template #title>低库存告警</template>
        <DataTable :value="lowStockItems" :loading="loading" stripedRows>
          <Column field="name" header="元件名称" />
          <Column field="part_number" header="型号" />
          <Column field="quantity" header="当前库存">
            <template #body="slotProps">
              <Tag :value="slotProps.data.quantity" severity="danger" />
            </template>
          </Column>
          <Column field="min_stock" header="最低库存" />
          <Column field="supplier_name" header="供应商" />
          <Column field="location" header="位置" />
        </DataTable>
        <div v-if="lowStockItems.length === 0 && !loading" class="empty-state">
          <i class="pi pi-check-circle" style="font-size: 3rem; color: #4caf50;"></i>
          <p>所有元件库存充足</p>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { statsApi } from '@/api'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'

const stats = ref({})
const lowStockItems = ref([])
const loading = ref(false)

const loadData = async () => {
  loading.value = true
  try {
    const [overviewRes, lowStockRes] = await Promise.all([
      statsApi.getOverview(),
      statsApi.getLowStock({ limit: 50 })
    ])
    
    stats.value = overviewRes.data.data
    lowStockItems.value = lowStockRes.data.data
  } catch (error) {
    console.error('Failed to load inventory data:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.inventory-view { padding: 0; }
.page-title { margin: 0 0 1.5rem; color: #333; font-size: 1.75rem; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem; }
.stat-card { background: white; border-radius: 12px; padding: 1.5rem; display: flex; align-items: center; gap: 1rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); }
.stat-card.warning { border-left: 4px solid #f44336; }
.stat-icon { width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
.stat-value { font-size: 1.75rem; font-weight: bold; color: #333; }
.stat-label { font-size: 0.875rem; color: #666; margin-top: 0.25rem; }
.cards-section { display: flex; flex-direction: column; gap: 1.5rem; }
.empty-state { text-align: center; padding: 3rem; color: #666; }
</style>
