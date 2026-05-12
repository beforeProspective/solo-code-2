<template>
  <v-app class="bg-grey-lighten-3">
    <v-main class="d-flex align-center justify-center">
      <v-card width="480" class="elevation-12">
        <v-card-title class="text-h4 text-center py-8">
          <v-icon class="mr-2 text-primary" size="36">mdi-login</v-icon>
          登录
        </v-card-title>
        <v-card-text>
          <v-form ref="form" v-model="valid" @submit.prevent="handleLogin">
            <v-text-field
              v-model="form.email"
              label="邮箱"
              type="email"
              prepend-icon="mdi-email"
              :rules="emailRules"
              required
              class="mb-4"
            ></v-text-field>
            <v-text-field
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              label="密码"
              prepend-icon="mdi-lock"
              :append-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
              @click:append="showPassword = !showPassword"
              :rules="passwordRules"
              required
              class="mb-4"
            ></v-text-field>
            <v-alert v-if="errorMessage" type="error" class="mb-4" dense>
              {{ errorMessage }}
            </v-alert>
            <v-btn
              type="submit"
              block
              color="primary"
              size="large"
              :loading="authStore.loading"
              :disabled="!valid"
            >
              登录
            </v-btn>
          </v-form>
        </v-card-text>
        <v-card-actions class="justify-center pb-8">
          还没有账号？
          <router-link to="/register" class="text-primary text-decoration-none">
            立即注册
          </router-link>
        </v-card-actions>
      </v-card>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const valid = ref(false)
const showPassword = ref(false)
const errorMessage = ref('')

const form = reactive({
  email: '',
  password: ''
})

const emailRules = [
  v => !!v || '请输入邮箱',
  v => /.+@.+/.test(v) || '请输入有效的邮箱地址'
]

const passwordRules = [
  v => !!v || '请输入密码',
  v => (v && v.length >= 8) || '密码至少8个字符'
]

async function handleLogin() {
  errorMessage.value = ''
  try {
    const credentials = {
      email: form.email,
      password: form.password
    }
    console.log('Login with:', credentials)
    await authStore.login(credentials)
    router.push('/dashboard')
  } catch (e) {
    console.error('Login error:', e)
    errorMessage.value = e.response?.data?.message || '登录失败，请检查您的凭证'
  }
}
</script>
