<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
      <h1 class="text-2xl font-bold text-center mb-6">注册</h1>
      <form @submit.prevent="handleRegister">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">姓名</label>
          <input
            v-model="form.name"
            type="text"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="您的姓名"
            required
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
          <input
            v-model="form.email"
            type="email"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="your@email.com"
            required
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">密码</label>
          <input
            v-model="form.password"
            type="password"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="••••••••"
            required
          />
        </div>
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">确认密码</label>
          <input
            v-model="form.password_confirmation"
            type="password"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="••••••••"
            required
          />
        </div>
        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {{ loading ? '注册中...' : '注册' }}
        </button>
      </form>
      <p class="mt-4 text-center text-sm text-gray-600">
        已有账号？
        <router-link to="/login" class="text-blue-600 hover:underline">登录</router-link>
      </p>
      <p v-if="error" class="mt-4 text-sm text-red-600 text-center">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({
  name: '',
  email: '',
  password: '',
  password_confirmation: ''
})
const loading = ref(false)
const error = ref('')

const handleRegister = async () => {
  loading.value = true
  error.value = ''
  try {
    await authStore.register(form.value)
    router.push('/admin/dashboard')
  } catch (e) {
    error.value = e.response?.data?.message || '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>
