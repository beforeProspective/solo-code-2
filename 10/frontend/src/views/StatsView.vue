<template>
  <div class="stats-view">
    <h2 class="page-title">统计分析</h2>
    
    <div class="overview-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background: #e3f2fd;">
          <i class="pi pi-microchip" style="color: #2196f3;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_components || 0 }}</div>
          <div class="stat-label">元件种类</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #e8f5e9;">
          <i class="pi pi-building" style="color: #4caf50;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_suppliers || 0 }}</div>
          <div class="stat-label">供应商</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #fff3e0;">
          <i class="pi pi-box" style="color: #ff9800;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_inventory || 0 }}</div>
          <div class="stat-label">总库存</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #fce4ec;">
          <i class="pi pi-list-check" style="color: #e91e63;"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.total_boms || 0 }}</div>
          <div class="stat-label">BOM 清单</div>
        </div>
      </div>
      <div class="stat-card" :class="{ 'warning': stats.low_stock_count > 0 }">
        <div class="stat-icon" :style="{ background: stats.low_stock_count > 0 ? '#ffebee' : '#f3e5f5' }">
          <i class="pi pi-exclamation-triangle" :style="{ color: stats.low_stock_count > 0 ? '#f44336' : '#9c27b0' }"></i>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.low_stock_count || 0 }}</div>
          <div class="stat-label">低库存</div>
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
    
    <div class="charts-grid">
      <div class="chart-card">
        <h3>按类别分布</h3>
        <div class="chart-container">
          <Bar v-if="categoryData" :data="categoryChartData" :options="barOptions" />
          <div v-else class="loading"><i class="pi pi-spin pi-spinner"></i></div>
        </div>
      </div>
      
      <div class="chart-card">
        <h3>按封装分布</h3>
        <div class="chart-container">
          <Doughnut v-if="packageData" :data="packageChartData" :options="doughnutOptions" />
          <div v-else class="loading"><i class="pi pi-spin pi-spinner"></i></div>
        </div>
      </div>
      
      <div class="chart-card">
        <h3>按供应商分布</h3>
        <div class="chart-container">
          <Bar v-if="supplierData" :data="supplierChartData" :options="horizontalBarOptions" />
          <div v-else class="loading"><i class="pi pi-spin pi-spinner"></i></div>
        </div>
      </div>
      
      <div class="chart-card">
        <h3>按类别库存数量</h3>
        <div class="chart-container">
          <Bar v-if="categoryQtyData" :data="categoryQtyChartData" :options="barOptions" />
          <div v-else class="loading"><i class="pi pi-spin pi-spinner"></i></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, ArcElement)

const stats = ref({})
const categoryData = ref(null)
const packageData = ref(null)
const supplierData = ref(null)
const categoryQtyData = ref(null)

const colors = [
  '#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0',
  '#00bcd4', '#673ab7', '#ffc107', '#f44336', '#009688',
  '#3f51b5', '#ff5722', '#795548', '#607d8b', '#8bc34a'
]

const barOptions = {
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

const horizontalBarOptions = {
  ...barOptions,
  indexAxis: 'y'
}

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

const supplierChartData = {
  get labels() { return supplierData.value?.map(d => d.name) || [] },
  get datasets() {
    return [{
      label: '元件种类',
      data: supplierData.value?.map(d => d.component_count) || [],
      backgroundColor: colors.slice(0, supplierData.value?.length || 0)
    }]
  }
}

const categoryQtyChartData = {
  get labels() { return categoryQtyData.value?.map(d => d.category) || [] },
  get datasets() {
    return [{
      label: '库存数量',
      data: categoryQtyData.value?.map(d => d.total_quantity) || [],
      backgroundColor: colors.slice(0, categoryQtyData.value?.length || 0)
    }]
  }
}

const loadStats = async () => {
  try {
    const [overview, category, pkg, supplier] = await Promise.all([
      statsApi.getOverview(),
      statsApi.getByCategory(),
      statsApi.getByPackage(),
      statsApi.getBySupplier()
    ])
    
    stats.value = overview.data.data
    categoryData.value = category.data.data
    categoryQtyData.value = category.data.data
    packageData.value = pkg.data.data
    supplierData.value = supplier.data.data
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.stats-view {
  padding: 0;
}

.page-title {
  margin: 0 0 1.5rem;
  color: #333;
  font-size: 1.75rem;
}

.overview-grid {
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

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
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
  font-size: 1.1rem;
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
</style>
