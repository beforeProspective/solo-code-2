<template>
  <div>
    <h1 class="title">统计分析</h1>

    <div class="columns mt-4">
      <div class="column">
        <div class="card stat-card">
          <div class="stat-number">{{ overview.total_links || 0 }}</div>
          <div class="stat-label">总链接数</div>
        </div>
      </div>
      <div class="column">
        <div class="card stat-card">
          <div class="stat-number">{{ overview.active_links || 0 }}</div>
          <div class="stat-label">活跃链接</div>
        </div>
      </div>
      <div class="column">
        <div class="card stat-card">
          <div class="stat-number">{{ overview.total_clicks || 0 }}</div>
          <div class="stat-label">总点击量</div>
        </div>
      </div>
      <div class="column">
        <div class="card stat-card">
          <div class="stat-number">{{ overview.today_clicks || 0 }}</div>
          <div class="stat-label">今日点击</div>
        </div>
      </div>
    </div>

    <div class="columns mt-4">
      <div class="column is-8">
        <div class="card">
          <header class="card-header">
            <p class="card-header-title">
              点击趋势
              <span class="select ml-2">
                <select v-model="days" @change="loadTrends">
                  <option :value="7">最近7天</option>
                  <option :value="30">最近30天</option>
                  <option :value="90">最近90天</option>
                </select>
              </span>
            </p>
          </header>
          <div class="card-content">
            <div v-if="trendsLoading" class="has-text-centered py-4">加载中...</div>
            <canvas ref="trendChartRef" height="200"></canvas>
          </div>
        </div>
      </div>

      <div class="column is-4">
        <div class="card">
          <header class="card-header">
            <p class="card-header-title">来源统计</p>
          </header>
          <div class="card-content">
            <div v-if="referrersLoading" class="has-text-centered py-4">加载中...</div>
            <div v-else-if="referrers?.length > 0">
              <canvas ref="referrerChartRef" height="200"></canvas>
            </div>
            <div v-else class="has-text-centered py-4 has-text-grey">
              暂无数据
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card mt-4">
      <header class="card-header">
        <p class="card-header-title">热门链接 TOP 5</p>
      </header>
      <div class="card-content">
        <div v-if="overviewLoading" class="has-text-centered py-4">加载中...</div>
        <div v-else-if="overview.top_links?.length > 0" class="table-container">
          <table class="table is-fullwidth is-striped">
            <thead>
              <tr>
                <th>排名</th>
                <th>短链接</th>
                <th>原始链接</th>
                <th>点击量</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(link, idx) in overview.top_links" :key="link.id">
                <td>
                  <span class="tag" :class="getRankTagClass(idx)">
                    #{{ idx + 1 }}
                  </span>
                </td>
                <td>
                  <a :href="link.short_url" target="_blank" class="has-text-primary">
                    {{ link.short_code }}
                  </a>
                </td>
                <td>{{ truncate(link.original_url, 50) }}</td>
                <td><span class="tag is-info">{{ link.clicks }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="has-text-centered py-4 has-text-grey">
          暂无数据
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { statsService } from '@/services/links'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const overview = ref({})
const trends = ref([])
const referrers = ref([])
const days = ref(30)
const overviewLoading = ref(true)
const trendsLoading = ref(true)
const referrersLoading = ref(true)

const trendChartRef = ref(null)
const referrerChartRef = ref(null)
let trendChart = null
let referrerChart = null

function truncate(text, length) {
  if (!text) return ''
  return text.length > length ? text.substring(0, length) + '...' : text
}

function getRankTagClass(idx) {
  if (idx === 0) return 'is-warning'
  if (idx === 1) return 'is-grey'
  if (idx === 2) return 'is-info'
  return 'is-light'
}

async function loadOverview() {
  try {
    overviewLoading.value = true
    const response = await statsService.getOverview()
    overview.value = response.data
  } catch (e) {
    console.error('Failed to load overview', e)
  } finally {
    overviewLoading.value = false
  }
}

async function loadTrends() {
  try {
    trendsLoading.value = true
    const response = await statsService.getTrends(days.value)
    trends.value = response.data.daily_stats || []
    await nextTick()
    renderTrendChart()
  } catch (e) {
    console.error('Failed to load trends', e)
  } finally {
    trendsLoading.value = false
  }
}

async function loadReferrers() {
  try {
    referrersLoading.value = true
    const response = await statsService.getReferrers()
    referrers.value = response.data.referrers || []
    await nextTick()
    renderReferrerChart()
  } catch (e) {
    console.error('Failed to load referrers', e)
  } finally {
    referrersLoading.value = false
  }
}

function renderTrendChart() {
  if (!trendChartRef.value) return
  
  if (trendChart) {
    trendChart.destroy()
  }

  const ctx = trendChartRef.value.getContext('2d')
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trends.value.map(d => d.date),
      datasets: [{
        label: '点击量',
        data: trends.value.map(d => d.clicks),
        borderColor: '#3273dc',
        backgroundColor: 'rgba(50, 115, 220, 0.1)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  })
}

function renderReferrerChart() {
  if (!referrerChartRef.value || referrers.value.length === 0) return
  
  if (referrerChart) {
    referrerChart.destroy()
  }

  const colors = ['#3273dc', '#23d160', '#ffdd57', '#ff3860', '#48c78e', '#00d1b2', '#b86bff']
  
  const ctx = referrerChartRef.value.getContext('2d')
  referrerChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: referrers.value.slice(0, 7).map(r => r.referer),
      datasets: [{
        data: referrers.value.slice(0, 7).map(r => r.count),
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  })
}

onMounted(() => {
  loadOverview()
  loadTrends()
  loadReferrers()
})
</script>
