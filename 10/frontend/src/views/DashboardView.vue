<template>
  <div class="dashboard">
    <h2 class="page-title">仪表盘</h2>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: #e3f2fd;">
          <i class="pi pi-microchip" style="color: #2196f3;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_components || 0 }}</div>
          <div class="stat-label">元件总数</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon" style="background: #e8f5e9;">
          <i class="pi pi-building" style="color: #4caf50;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_suppliers || 0 }}</div>
          <div class="stat-label">供应商数</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon" style="background: #fff3e0;">
          <i class="pi pi-box" style="color: #ff9800;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_inventory || 0 }}</div>
          <div class="stat-label">库存总数</div>
        </div>
      </div>
      
      <div class="stat-card" :class="{ 'warning': stats.low_stock_count > 0 }">
        <div class="stat-icon" :style="{ background: stats.low_stock_count > 0 ? '#ffebee' : '#f3e5f5' }">
          <i class="pi pi-exclamation-triangle" :style="{ color: stats.low_stock_count > 0 ? '#f44336' : '#9c27b0' }"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.low_stock_count || 0 }}</div>
          <div class="stat-label">低库存告警</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon" style="background: #fce4ec;">
          <i class="pi pi-list-check" style="color: #e91e63;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_boms || 0 }}</div>
          <div class="stat-label">BOM清单</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon" style="background: #e0f2f1;">
          <i class="pi pi-dollar" style="color: #009688;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">¥{{ stats.inventory_value?.toFixed(2) || '0.00' }}</div>
          <div class="stat-label">库存价值</div>
        </div>
      </div>
    </div>
    
    <div class="charts-section">
      <div class="chart-card">
        <h3>按类别统计</h3>
        <div v-if="categoryData" class="chart-container">
          <Bar :data="categoryChartData" :options="chartOptions" />
        </div>
        <div v-else class="loading">
          <i class="pi pi-spin pi-spinner"></i>
        </div>
      </div>
      
      <div class="chart-card">
        <h3>按封装统计</h3>
        <div v-if="packageData" class="chart-container">
          <Doughnut :data="packageChartData" :options="doughnutOptions" />
        </div>
        <div v-else class="loading">
          <i class="pi pi-spin pi-spinner"></i>
        </div>
      </div>
    </div>
    
    <div class="recent-section">
      <div class="recent-card">
        <div class="card-header">
          <h3>最近添加的元件</h3>
          <Button 
            label="查看全部" 
            icon="pi pi-arrow-right" 
            text 
            @click="router.push('/components')"
          />
        </div>
        <DataTable :value="recentComponents" :loading="loadingRecent" stripedRows>
          <Column field="name" header="名称" />
          <Column field="part_number" header="型号" />
          <Column field="category" header="类别" />
          <Column field="quantity" header="库存">
            <template #body="slotProps">
              <Tag 
                :value="slotProps.data.quantity || 0" 
                :severity="(slotProps.data.quantity || 0) <= 10 ? 'danger' : 'success'" 
              />
            </template>
          </Column>
        </DataTable>
      </div>
      
      <div class="recent-card">
        <div class="card-header">
          <h3>按供应商统计</h3>
        </div>
        <DataTable :value="supplierStats" :loading="loadingSupplier" stripedRows>
          <Column field="name" header="供应商" />
          <Column field="component_count" header="元件种类" />
          <Column field="total_quantity" header="库存总数" />
          <Column field="total_value" header="总价值">
            <template #body="slotProps">
              ¥{{ (slotProps.data.total_value || 0).toFixed(2) }}
            </template>
          </Column>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { statsApi } from '@/api'
import { Bar, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  ArcElement
} from 'chart.js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement)

const router = useRouter()

const stats = ref({})
const categoryData = ref(null)
const packageData = ref(null)
const recentComponents = ref([])
const supplierStats = ref([])
const loadingRecent = ref(false)
const loadingSupplier = ref(false)

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false }
  },
  scales: {
    y: { beginAtZero: true }
  }
}

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' }
  }
}

const colors = [
  '#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0',
  '#00bcd4', '#673ab7', '#ffc107', '#f44336', '#009688',
  '#3f51b5', '#ff5722', '#795548', '#607d8b', '#8bc34a'
]

const categoryChartData = {
  get labels() { return categoryData.value?.map(d => d.category) || [] },
  get datasets() {
    return [{
      label: '元件数量',
      data: categoryData.value?.map(d => d.count) || [],
      backgroundColor: colors.slice(0, categoryData.value?.length || 0)
    }]
  }
}

const packageChartData = {
  get labels() { return packageData.value?.map(d => d.package) || [] },
  get datasets() {
    return [{
      data: packageData.value?.map(d => d.count) || [],
      backgroundColor: colors.slice(0, packageData.value?.length || 0)
    }]
  }
}

const loadStats = async () => {
  try {
    const [overview, category, pkg, recent, supplier] = await Promise.all([
      statsApi.getOverview(),
      statsApi.getByCategory(),
      statsApi.getByPackage(),
      statsApi.getRecent({ limit: 10 }),
      statsApi.getBySupplier()
    ])
    
    stats.value = overview.data.data
    categoryData.value = category.data.data
    packageData.value = pkg.data.data
    recentComponents.value = recent.data.data
    supplierStats.value = supplier.data.data
  } catch (error) {
    console.error('Failed to load dashboard stats:', error)
  } finally {
    loadingRecent.value = false
    loadingSupplier.value = false
  }
}

onMounted(() => {
  loadingRecent.value = true
  loadingSupplier.value = true
  loadStats()
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.page-title {
  margin: 0 0 1.5rem;
  color: #333;
  font-size: 1.75rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-card.warning {
  border-left: 4px solid #f44336;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: bold;
  color: #333;
}

.stat-label {
  font-size: 0.875rem;
  color: #666;
  margin-top: 0.25rem;
}

.charts-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.chart-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.chart-card h3 {
  margin: 0 0 1rem;
  color: #333;
}

.chart-container {
  height: 300px;
}

.loading {
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}

.recent-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.recent-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.card-header h3 {
  margin: 0;
  color: #333;
}
</style>
