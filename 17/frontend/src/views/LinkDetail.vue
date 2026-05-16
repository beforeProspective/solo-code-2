<template>
  <div v-if="link">
    <div class="level">
      <div class="level-left">
        <h1 class="title">链接详情</h1>
      </div>
      <div class="level-right">
        <router-link to="/links" class="button">
          <span class="icon"><i class="fas fa-arrow-left"></i></span>
          <span>返回列表</span>
        </router-link>
      </div>
    </div>

    <div class="columns">
      <div class="column is-8">
        <div class="card">
          <header class="card-header">
            <p class="card-header-title">基本信息</p>
          </header>
          <div class="card-content">
            <div class="field">
              <label class="label">短链接</label>
              <div class="field has-addons">
                <div class="control is-expanded">
                  <input class="input" :value="link.short_url" readonly />
                </div>
                <div class="control">
                  <button class="button is-info" @click="copyToClipboard(link.short_url)">
                    <span class="icon"><i class="fas fa-copy"></i></span>
                  </button>
                </div>
              </div>
            </div>

            <div class="field">
              <label class="label">原始链接</label>
              <div class="control">
                <a :href="link.original_url" target="_blank" class="has-text-link">
                  {{ link.original_url }}
                </a>
              </div>
            </div>

            <div class="field">
              <label class="label">点击量</label>
              <div class="control">
                <span class="tag is-info is-medium">{{ link.clicks }}</span>
              </div>
            </div>

            <div class="field">
              <label class="label">状态</label>
              <div class="control">
                <span class="tag" :class="link.active ? 'is-success' : 'is-danger'">
                  {{ link.active ? '启用' : '禁用' }}
                </span>
              </div>
            </div>

            <div class="field">
              <label class="label">创建时间</label>
              <div class="control">
                {{ formatDate(link.created_at) }}
              </div>
            </div>
          </div>
        </div>

        <div class="card mt-4" v-if="stats">
          <header class="card-header">
            <p class="card-header-title">点击统计</p>
          </header>
          <div class="card-content">
            <div class="columns">
              <div class="column">
                <div class="stat-card">
                  <div class="stat-number">{{ stats.total_clicks }}</div>
                  <div class="stat-label">总点击</div>
                </div>
              </div>
              <div class="column">
                <div class="stat-card">
                  <div class="stat-number">{{ stats.clicks_last_7_days }}</div>
                  <div class="stat-label">最近7天</div>
                </div>
              </div>
              <div class="column">
                <div class="stat-card">
                  <div class="stat-number">{{ stats.clicks_last_30_days }}</div>
                  <div class="stat-label">最近30天</div>
                </div>
              </div>
            </div>

            <div v-if="stats.daily_clicks?.length > 0" class="mt-4">
              <h3 class="subtitle is-5">最近30天点击趋势</h3>
              <canvas ref="chartRef"></canvas>
            </div>

            <div v-if="stats.referrers?.length > 0" class="mt-4">
              <h3 class="subtitle is-5">来源统计</h3>
              <table class="table is-fullwidth is-striped">
                <thead>
                  <tr><th>来源</th><th>点击量</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(ref, idx) in stats.referrers" :key="idx">
                    <td>{{ ref.referer }}</td>
                    <td>{{ ref.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="column is-4">
        <div class="card">
          <header class="card-header">
            <p class="card-header-title">二维码</p>
          </header>
          <div class="card-content has-text-centered">
            <div v-if="qrCodeUrl">
              <img :src="qrCodeUrl" alt="QR Code" class="qr-code" />
              <p class="mt-2">
                <a :href="qrCodeUrl" download="qrcode.png" class="button is-small">
                  下载二维码
                </a>
              </p>
            </div>
            <div v-else>加载中...</div>
          </div>
        </div>

        <div class="card mt-4">
          <header class="card-header">
            <p class="card-header-title">操作</p>
          </header>
          <div class="card-content">
            <div class="buttons is-fullwidth">
              <button 
                class="button is-fullwidth" 
                :class="link.active ? 'is-warning' : 'is-success'"
                @click="toggleLink"
              >
                <span class="icon">
                  <i :class="link.active ? 'fas fa-pause' : 'fas fa-play'"></i>
                </span>
                <span>{{ link.active ? '禁用' : '启用' }}</span>
              </button>
              <button 
                class="button is-danger is-fullwidth" 
                @click="deleteLink"
              >
                <span class="icon"><i class="fas fa-trash"></i></span>
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="has-text-centered py-4">
    加载中...
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { linksService } from '@/services/links'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const route = useRoute()
const router = useRouter()

const link = ref(null)
const stats = ref(null)
const qrCodeUrl = ref('')
const chartRef = ref(null)
let chartInstance = null

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    alert('链接已复制到剪贴板')
  } catch (e) {
    alert('复制失败')
  }
}

async function loadLink() {
  try {
    const id = route.params.id
    const response = await linksService.get(id)
    link.value = response.data
    loadStats(id)
    loadQrCode(id)
  } catch (e) {
    console.error('Failed to load link', e)
  }
}

async function loadStats(id) {
  try {
    const response = await linksService.getStats(id)
    stats.value = response.data
    await nextTick()
    renderChart()
  } catch (e) {
    console.error('Failed to load stats', e)
  }
}

async function loadQrCode(id) {
  try {
    const response = await linksService.getQrCode(id)
    const blob = new Blob([response.data], { type: 'image/png' })
    qrCodeUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    console.error('Failed to load QR code', e)
  }
}

function renderChart() {
  if (!chartRef.value || !stats.value?.daily_clicks) return
  
  if (chartInstance) {
    chartInstance.destroy()
  }

  const ctx = chartRef.value.getContext('2d')
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: stats.value.daily_clicks.map(d => d.date),
      datasets: [{
        label: '点击量',
        data: stats.value.daily_clicks.map(d => d.count),
        borderColor: '#3273dc',
        backgroundColor: 'rgba(50, 115, 220, 0.1)',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  })
}

async function toggleLink() {
  try {
    await linksService.toggle(link.value.id)
    link.value.active = !link.value.active
  } catch (e) {
    alert('操作失败')
  }
}

async function deleteLink() {
  if (!confirm('确定要删除这个短链接吗？')) return
  
  try {
    await linksService.delete(link.value.id)
    router.push('/links')
  } catch (e) {
    alert('删除失败')
  }
}

onMounted(() => {
  loadLink()
})
</script>

<style scoped>
.qr-code {
  max-width: 200px;
  margin: 0 auto;
}
</style>
