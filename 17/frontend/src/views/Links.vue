<template>
  <div>
    <div class="level">
      <div class="level-left">
        <h1 class="title">链接管理</h1>
      </div>
      <div class="level-right">
        <router-link to="/links/create" class="button is-primary">
          <span class="icon"><i class="fas fa-plus"></i></span>
          <span>创建短链接</span>
        </router-link>
      </div>
    </div>

    <div v-if="error" class="notification is-danger">
      {{ error }}
    </div>

    <div class="card">
      <div class="card-content">
        <div v-if="loading" class="has-text-centered py-4">加载中...</div>
        <div v-else-if="links.length > 0" class="table-container">
          <table class="table is-fullwidth is-hoverable">
            <thead>
              <tr>
                <th>短码</th>
                <th class="mobile-hide">原始链接</th>
                <th>点击量</th>
                <th class="mobile-hide">创建时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="link in links" :key="link.id" class="link-item">
                <td>
                  <div class="field has-addons">
                    <div class="control">
                      <input class="input is-small" :value="link.short_url" readonly />
                    </div>
                    <div class="control">
                      <button 
                        class="button is-small is-info copy-btn" 
                        @click="copyToClipboard(link.short_url)"
                      >
                        <span class="icon is-small"><i class="fas fa-copy"></i></span>
                      </button>
                    </div>
                  </div>
                </td>
                <td class="mobile-hide">
                  <a :href="link.original_url" target="_blank" class="has-text-link">
                    {{ truncate(link.original_url, 40) }}
                  </a>
                </td>
                <td><span class="tag is-info">{{ link.clicks }}</span></td>
                <td class="mobile-hide">{{ formatDate(link.created_at) }}</td>
                <td>
                  <span class="tag" :class="link.active ? 'is-success' : 'is-danger'">
                    {{ link.active ? '启用' : '禁用' }}
                  </span>
                </td>
                <td>
                  <div class="buttons are-small">
                    <router-link 
                      :to="`/links/${link.id}`" 
                      class="button is-info"
                    >
                      <span class="icon"><i class="fas fa-chart-line"></i></span>
                    </router-link>
                    <button 
                      class="button" 
                      :class="link.active ? 'is-warning' : 'is-success'"
                      @click="toggleLink(link.id)"
                    >
                      <span class="icon">
                        <i :class="link.active ? 'fas fa-pause' : 'fas fa-play'"></i>
                      </span>
                    </button>
                    <button 
                      class="button is-danger" 
                      @click="deleteLink(link.id)"
                    >
                      <span class="icon"><i class="fas fa-trash"></i></span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="has-text-centered py-4 has-text-grey">
          <p class="mb-2">暂无短链接</p>
          <router-link to="/links/create" class="button is-primary">
            创建第一个短链接
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { linksService } from '@/services/links'

const router = useRouter()
const links = ref([])
const loading = ref(true)
const error = ref('')

function truncate(text, length) {
  if (!text) return ''
  return text.length > length ? text.substring(0, length) + '...' : text
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

async function loadLinks() {
  try {
    loading.value = true
    error.value = ''
    const response = await linksService.getAll()
    links.value = response.data.data || response.data
  } catch (e) {
    error.value = e.response?.data?.error || '加载失败'
  } finally {
    loading.value = false
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    alert('链接已复制到剪贴板')
  } catch (e) {
    const input = document.createElement('input')
    input.value = text
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    alert('链接已复制到剪贴板')
  }
}

async function toggleLink(id) {
  try {
    await linksService.toggle(id)
    loadLinks()
  } catch (e) {
    error.value = e.response?.data?.error || '操作失败'
  }
}

async function deleteLink(id) {
  if (!confirm('确定要删除这个短链接吗？')) return
  
  try {
    await linksService.delete(id)
    loadLinks()
  } catch (e) {
    error.value = e.response?.data?.error || '删除失败'
  }
}

onMounted(() => {
  loadLinks()
})
</script>
