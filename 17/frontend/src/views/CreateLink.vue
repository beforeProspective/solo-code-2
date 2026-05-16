<template>
  <div>
    <div class="level">
      <div class="level-left">
        <h1 class="title">创建短链接</h1>
      </div>
      <div class="level-right">
        <router-link to="/links" class="button">
          <span class="icon"><i class="fas fa-arrow-left"></i></span>
          <span>返回列表</span>
        </router-link>
      </div>
    </div>

    <div v-if="error" class="notification is-danger">
      {{ error }}
    </div>

    <div v-if="success" class="notification is-success">
      <p>短链接创建成功！</p>
      <p class="mt-2">
        <strong>短链接：</strong>
        <a :href="createdLink.short_url" target="_blank" class="has-text-link">
          {{ createdLink.short_url }}
        </a>
      </p>
    </div>

    <div class="card">
      <div class="card-content">
        <form @submit.prevent="handleSubmit">
          <div class="field">
            <label class="label">原始链接 *</label>
            <div class="control">
              <input 
                v-model="form.original_url" 
                type="url" 
                class="input" 
                placeholder="https://example.com/very/long/url"
                required
              />
            </div>
            <p class="help">请输入要缩短的完整URL</p>
          </div>

          <div class="field">
            <label class="label">自定义短码</label>
            <div class="control">
              <input 
                v-model="form.custom_code" 
                type="text" 
                class="input" 
                placeholder="my-custom-code"
              />
            </div>
            <p class="help">留空将自动生成6位随机短码</p>
          </div>

          <div class="field">
            <label class="label">自定义域名</label>
            <div class="control">
              <input 
                v-model="form.custom_domain" 
                type="url" 
                class="input" 
                placeholder="https://your-domain.com"
              />
            </div>
            <p class="help">可选，使用您自己的域名</p>
          </div>

          <div class="field">
            <label class="label">访问密码</label>
            <div class="control">
              <input 
                v-model="form.password" 
                type="password" 
                class="input" 
                placeholder="设置访问密码"
              />
            </div>
            <p class="help">可选，设置后访问短链接需要输入密码</p>
          </div>

          <div class="field">
            <label class="label">过期时间</label>
            <div class="control">
              <input 
                v-model="form.expires_at" 
                type="datetime-local" 
                class="input"
              />
            </div>
            <p class="help">可选，设置后链接将在指定时间后失效</p>
          </div>

          <div class="field is-grouped">
            <div class="control">
              <button 
                type="submit" 
                class="button is-primary"
                :disabled="loading"
              >
                <span v-if="loading">创建中...</span>
                <span v-else>创建短链接</span>
              </button>
            </div>
            <div class="control">
              <button 
                type="button" 
                class="button"
                @click="resetForm"
              >
                重置
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { linksService } from '@/services/links'

const router = useRouter()

const form = ref({
  original_url: '',
  custom_code: '',
  custom_domain: '',
  password: '',
  expires_at: ''
})

const loading = ref(false)
const error = ref('')
const success = ref(false)
const createdLink = ref(null)

function resetForm() {
  form.value = {
    original_url: '',
    custom_code: '',
    custom_domain: '',
    password: '',
    expires_at: ''
  }
  error.value = ''
  success.value = false
  createdLink.value = null
}

async function handleSubmit() {
  try {
    loading.value = true
    error.value = ''
    success.value = false
    
    const data = { ...form.value }
    if (!data.custom_code) delete data.custom_code
    if (!data.custom_domain) delete data.custom_domain
    if (!data.password) delete data.password
    if (!data.expires_at) delete data.expires_at
    
    const response = await linksService.create(data)
    createdLink.value = response.data
    success.value = true
  } catch (e) {
    error.value = e.response?.data?.error || '创建失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>
