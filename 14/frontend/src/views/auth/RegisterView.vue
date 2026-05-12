<template>
  <v-app class="bg-grey-lighten-3">
    <v-main class="d-flex align-center justify-center">
      <v-card width="520" class="elevation-12">
        <v-card-title class="text-h4 text-center py-8">
          <v-icon class="mr-2 text-primary" size="36">mdi-account-plus</v-icon>
          注册
        </v-card-title>
        <v-card-text>
          <v-form ref="form" v-model="valid" @submit.prevent="handleRegister">
            <v-text-field
              v-model="form.name"
              label="姓名"
              prepend-icon="mdi-account"
              :rules="nameRules"
              required
              class="mb-4"
            ></v-text-field>
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
              v-model="form.organization"
              label="组织名称（可选）"
              prepend-icon="mdi-domain"
              class="mb-4"
            ></v-text-field>
            <v-text-field
              v-model="form.phone"
              label="联系电话（可选）"
              prepend-icon="mdi-phone"
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
            <v-text-field
              v-model="form.password_confirmation"
              :type="showConfirmPassword ? 'text' : 'password'"
              label="确认密码"
              prepend-icon="mdi-lock-check"
              :append-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
              @click:append="showConfirmPassword = !showConfirmPassword"
              :rules="confirmPasswordRules"
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
              注册
            </v-btn>
          </v-form>
        </v-card-text>
        <v-card-actions class="justify-center pb-8">
          已有账号？
          <router-link to="/login" class="text-primary text-decoration-none">
            立即登录
          </router-link>
        </v-card-actions>
      </v-card>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref(null)
const valid = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const errorMessage = ref('')

const form = reactive({
  name: '',
  email: '',
  organization: '',
  phone: '',
  password: '',
  password_confirmation: ''
})

const nameRules = [
  v => !!v || '请输入姓名',
  v => (v && v.length <= 255) || '姓名不能超过255个字符'
]

const emailRules = [
  v => !!v || '请输入邮箱',
  v => /.+@.+/.test(v) || '请输入有效的邮箱地址'
]

const passwordRules = [
  v => !!v || '请输入密码',
  v => (v && v.length >= 8) || '密码至少8个字符'
]

const confirmPasswordRules = computed(() => [
  v => !!v || '请确认密码',
  v => v === form.password || '两次输入的密码不一致'
])

async function handleRegister() {
  errorMessage.value = ''
  try {
    const data = {
      name: form.name,
      email: form.email,
      password: form.password,
      password_confirmation: form.password_confirmation,
      organization: form.organization || null,
      phone: form.phone || null
    }
    console.log('Register with:', data)
    await authStore.register(data)
    router.push('/dashboard')
  } catch (e) {
    console.error('Register error:', e)
    const errors = e.response?.data?.errors
    if (errors) {
      errorMessage.value = Object.values(errors).flat().join(' ')
    } else {
      errorMessage.value = e.response?.data?.message || '注册失败'
    }
  }
}
</script>
