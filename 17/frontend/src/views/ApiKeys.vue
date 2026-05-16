<template>
  <div>
    <div class="level">
      <div class="level-left">
        <h1 class="title">API密钥管理</h1>
      </div>
      <div class="level-right">
        <button class="button is-primary" @click="showCreateModal = true">
          <span class="icon"><i class="fas fa-plus"></i></span>
          <span>创建API密钥</span>
        </button>
      </div>
    </div>

    <div class="notification is-info">
      <p>
        <span class="icon"><i class="fas fa-info-circle"></i></span>
        <span>使用API密钥可以通过编程方式创建短链接。在请求头中添加 <code>X-API-Key: &lt;your-api-key&gt;</code> 调用 <code>POST /api/links/public</code> 接口。</span>
      </p>
    </div>

    <div v-if="error" class="notification is-danger">
      {{ error }}
    </div>

    <div class="card">
      <div class="card-content">
        <div v-if="loading" class="has-text-centered py-4">加载中...</div>
        <div v-else-if="apiKeys.length > 0" class="table-container">
          <table class="table is-fullwidth is-hoverable">
            <thead>
              <tr>
                <th>名称</th>
                <th>密钥</th>
                <th>使用次数</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="key in apiKeys" :key="key.id">
                <td>{{ key.name }}</td>
                <td>
                  <code>{{ maskKey(key.key) }}</code>
                  <button 
                    class="button is-small is-white ml-2" 
                    @click="copyToClipboard(key.key)"
                  >
                    <span class="icon is-small"><i class="fas fa-copy"></i></span>
                  </button>
                </td>
                <td><span class="tag is-info">{{ key.usage_count }}</span></td>
                <td>
                  <span class="tag" :class="key.active ? 'is-success' : 'is-danger'">
                    {{ key.active ? '启用' : '禁用' }}
                  </span>
                </td>
                <td>{{ formatDate(key.created_at) }}</td>
                <td>
                  <button 
                    class="button is-small is-danger" 
                    @click="deleteKey(key.id)"
                  >
                    <span class="icon is-small"><i class="fas fa-trash"></i></span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="has-text-centered py-4 has-text-grey">
          <p class="mb-2">暂无API密钥</p>
          <button class="button is-primary" @click="showCreateModal = true">
            创建第一个API密钥
          </button>
        </div>
      </div>
    </div>

    <div class="modal" :class="{ 'is-active': showCreateModal }">
      <div class="modal-background" @click="showCreateModal = false"></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">创建API密钥</p>
          <button class="delete" aria-label="close" @click="showCreateModal = false"></button>
        </header>
        <section class="modal-card-body">
          <div class="field">
            <label class="label">密钥名称</label>
            <div class="control">
              <input 
                v-model="newKey.name" 
                type="text" 
                class="input" 
                placeholder="我的应用"
              />
            </div>
            <p class="help">用于识别不同的API密钥</p>
          </div>

          <div class="field">
            <label class="label">使用限制（可选）</label>
            <div class="control">
              <input 
                v-model.number="newKey.limit" 
                type="number" 
                class="input" 
                placeholder="留空表示无限制"
                min="1"
              />
            </div>
            <p class="help">设置此API密钥的最大使用次数</p>
          </div>
        </section>
        <footer class="modal-card-foot">
          <button 
            class="button is-primary" 
            @click="createKey"
            :disabled="creating"
          >
            <span v-if="creating">创建中...</span>
            <span v-else>创建</span>
          </button>
          <button class="button" @click="showCreateModal = false">取消</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiKeysService } from '@/services/links'

const apiKeys = ref([])
const loading = ref(true)
const error = ref('')
const showCreateModal = ref(false)
const creating = ref(false)
const newKey = ref({
  name: '',
  limit: null
})

function maskKey(key) {
  if (!key) return ''
  return key.substring(0, 8) + '...' + key.substring(key.length - 4)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

async function loadKeys() {
  try {
    loading.value = true
    error.value = ''
    const response = await apiKeysService.getAll()
    apiKeys.value = response.data
  } catch (e) {
    error.value = e.response?.data?.error || '加载失败'
  } finally {
    loading.value = false
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    alert('API密钥已复制到剪贴板')
  } catch (e) {
    alert('复制失败')
  }
}

async function createKey() {
  if (!newKey.value.name) {
    alert('请输入密钥名称')
    return
  }

  try {
    creating.value = true
    const data = {
      name: newKey.value.name
    }
    if (newKey.value.limit) {
      data.limit = newKey.value.limit
    }
    await apiKeysService.create(data)
    showCreateModal.value = false
    newKey.value = { name: '', limit: null }
    loadKeys()
  } catch (e) {
    alert(e.response?.data?.error || '创建失败')
  } finally {
    creating.value = false
  }
}

async function deleteKey(id) {
  if (!confirm('确定要删除这个API密钥吗？删除后将无法恢复。')) return
  
  try {
    await apiKeysService.delete(id)
    loadKeys()
  } catch (e) {
    error.value = e.response?.data?.error || '删除失败'
  }
}

onMounted(() => {
  loadKeys()
})
</script>
