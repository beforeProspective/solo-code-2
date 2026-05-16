<template>
  <div class="login-container">
    <div class="login-box">
      <h1 class="login-title">
        <o-icon icon="user-plus" pack="fas" size="large"></o-icon>
        <br>
        用户注册
      </h1>
      
      <o-field label="用户名">
        <o-input v-model="username" placeholder="请输入用户名"></o-input>
      </o-field>
      
      <o-field label="邮箱">
        <o-input v-model="email" type="email" placeholder="请输入邮箱"></o-input>
      </o-field>
      
      <o-field label="密码">
        <o-input v-model="password" type="password" placeholder="请输入密码（至少6位）" password-reveal></o-input>
      </o-field>
      
      <o-button variant="primary" expanded @click="register" :loading="loading">
        注册
      </o-button>
      
      <p class="has-text-centered" style="margin-top: 15px;">
        已有账号？
        <router-link to="/login">立即登录</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)

async function register() {
  if (!username.value || !email.value || !password.value) {
    alert('请填写完整信息')
    return
  }
  
  if (password.value.length < 6) {
    alert('密码至少6位')
    return
  }
  
  loading.value = true
  const result = await authStore.register(username.value, email.value, password.value)
  loading.value = false
  
  if (result.success) {
    alert('注册成功，请登录')
    router.push('/login')
  } else {
    alert(result.error)
  }
}
</script>
