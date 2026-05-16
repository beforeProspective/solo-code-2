<template>
  <section class="hero is-fullheight is-light">
    <div class="hero-body">
      <div class="container">
        <div class="columns is-centered">
          <div class="column is-4">
            <div class="box">
              <h1 class="title has-text-centered">登录</h1>
              <p class="subtitle has-text-centered">URL短链接管理平台</p>
              
              <div v-if="error" class="notification is-danger">
                {{ error }}
              </div>

              <form @submit.prevent="handleLogin">
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
                      placeholder="••••••"
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
                      <span v-else>登录</span>
                    </button>
                  </div>
                </div>
              </form>

              <div class="has-text-centered mt-4">
                <p>
                  还没有账号？<router-link to="/register">立即注册</router-link>
                </p>
                <p class="is-size-7 has-text-grey mt-2">
                  测试账号: admin@example.com / admin123
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
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const form = ref({
  email: 'admin@example.com',
  password: 'admin123'
})
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  try {
    loading.value = true
    error.value = ''
    await authStore.login(form.value)
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (e) {
    error.value = e.response?.data?.error || '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>
