<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold text-gray-800">仪表盘</h1>
      <p class="text-gray-500 mt-1">业务概览与统计</p>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="bg-white rounded-xl shadow p-6 border-l-4 border-blue-500">
        <div class="text-gray-500 text-sm">客户总数</div>
        <div class="text-3xl font-bold text-gray-800 mt-2">{{ summary.total_customers || 0 }}</div>
      </div>
      <div class="bg-white rounded-xl shadow p-6 border-l-4 border-green-500">
        <div class="text-gray-500 text-sm">发票总数</div>
        <div class="text-3xl font-bold text-gray-800 mt-2">{{ summary.total_invoices || 0 }}</div>
      </div>
      <div class="bg-white rounded-xl shadow p-6 border-l-4 border-purple-500">
        <div class="text-gray-500 text-sm">总收入</div>
        <div class="text-3xl font-bold text-gray-800 mt-2">¥{{ formatMoney(summary.total_revenue) }}</div>
      </div>
      <div class="bg-white rounded-xl shadow p-6 border-l-4 border-red-500">
        <div class="text-gray-500 text-sm">逾期未收</div>
        <div class="text-3xl font-bold text-red-600 mt-2">¥{{ formatMoney(summary.overdue_total) }}</div>
        <div class="text-xs text-red-400 mt-1">{{ summary.overdue_count || 0 }} 张逾期发票</div>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow p-6">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-bold text-gray-800">月度收入统计</h2>
        <select v-model="selectedYear" @change="loadStats" class="border rounded px-3 py-2 text-sm">
          <option v-for="y in [2026, 2025, 2024]" :key="y" :value="y">{{ y }}年</option>
        </select>
      </div>
      <div class="h-80">
        <canvas ref="chartCanvas"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { statsAPI } from '../api'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const chartCanvas = ref(null)
const selectedYear = ref(new Date().getFullYear())
const summary = ref({})
const monthlyData = ref([])
let chartInstance = null

const formatMoney = (n) => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const loadStats = async () => {
  try {
    const res = await statsAPI.get(selectedYear.value)
    summary.value = res.data.data.summary
    monthlyData.value = res.data.data.monthly
    renderChart()
  } catch (e) {
    console.error(e)
  }
}

const renderChart = () => {
  if (chartInstance) chartInstance.destroy()
  if (!chartCanvas.value) return
  
  const ctx = chartCanvas.value.getContext('2d')
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthlyData.value.map(m => m.month_name.slice(0, 3)),
      datasets: [
        {
          label: '总金额 (¥)',
          data: monthlyData.value.map(m => m.total),
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1
        },
        {
          label: '已收款 (¥)',
          data: monthlyData.value.map(m => m.paid),
          backgroundColor: 'rgba(16, 185, 129, 0.5)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true } }
    }
  })
}

onMounted(() => loadStats())
onUnmounted(() => { if (chartInstance) chartInstance.destroy() })
</script>
