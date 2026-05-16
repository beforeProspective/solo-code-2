<template>
  <section class="hero is-fullheight is-light">
    <div class="hero-body">
      <div class="container">
        <div class="columns is-centered">
          <div class="column is-4">
            <div class="box">
              <h1 class="title has-text-centered">注册</h1>
              <p class="subtitle has-text-centered">创建您的账号</p>
              
              <div v-if="error" class="notification is-danger">
                {{ error }}
              </div>

              <form @submit.prevent="handleRegister">
                <div class="field">
                  <label class="label">姓名</label>
                  <div class="control">
                    <input 
                      v-model="form.name" 
                      type="text" 
                      class="input" 
                      placeholder="您的姓名"
                      required
                    />
                  </div>
                </div>

                <div class="field">
                  <label class="label">邮箱</label>
                  <div class="control">
                    <input 
                      v-model="form.email" 
                      type="email" 
                      class="input" 
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                </div>

                <div class="field">
                  <label class="label">密码</label>
                  <div class="control">
                    <input 
                      v-model="form.password" 
                      type="password" 
                      class="input" 
                      placeholder="至少6位密码"
                      required
                    />
                  </div>
                </div>

                <div class="field">
                  <div class="control">
                    <button 
                      type="submit" 
                      class="button is-primary is-fullwidth"
                      :disabled="loading"
                    >
                      <span v-if="loading">加载中...</span>
                      <span v-else>注册</span>
                    </button>
                  </div>
                </div>
              </form>

              <div class="has-text-centered mt-4">
                <p>
                  已有账号？<router-link to="/login">立即登录</router-link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()

const form = ref({
  name: '',
  email: '',
  password: ''
})
const error = ref('')
const loading = ref(false)

async function handleRegister() {
  try {
    loading.value = true
    error.value = ''
    await authStore.register(form.value)
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.error || '注册失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>
