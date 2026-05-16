<template>
  <div>
    <h1 class="title">仪表盘</h1>
    
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

    <div class="card mt-6">
      <header class="card-header">
        <p class="card-header-title">
          <span class="icon"><i class="fas fa-fire"></i></span>
          <span class="ml-2">热门链接</span>
        </p>
      </header>
      <div class="card-content">
        <div v-if="loading" class="has-text-centered py-4">加载中...</div>
        <div v-else-if="overview.top_links?.length > 0">
          <table class="table is-fullwidth is-striped">
            <thead>
              <tr>
              <th>原始链接</th>
              <th>短链接</th>
              <th>点击量</th>
              <th>状态</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="link in overview.top_links" :key="link.id">
              <td>
                <a :href="link.original_url" target="_blank" class="has-text-link">
                  {{ truncate(link.original_url, 50) }}
                </a>
              </td>
              <td>
                <a :href="link.short_url" target="_blank" class="has-text-primary">
                  {{ link.short_code }}
                </a>
              </td>
              <td><span class="tag is-info">{{ link.clicks }}</span></td>
              <td>
                <span class="tag" :class="link.active ? 'is-success' : 'is-danger'">
                  {{ link.active ? '启用' : '禁用' }}
                </span>
              </td>
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
import { ref, onMounted } from 'vue'
import { statsService } from '@/services/links'

const overview = ref({})
const loading = ref(true)

function truncate(text, length) {
  if (!text) return ''
  return text.length > length ? text.substring(0, length) + '...' : text
}

onMounted(async () => {
  try {
    const response = await statsService.getOverview()
    overview.value = response.data
  } catch (e) {
    console.error('Failed to load overview', e)
  } finally {
    loading.value = false
  }
})
</script>
