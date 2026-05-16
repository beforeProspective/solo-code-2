<template>
  <div class="login-container">
    <div class="login-box">
      <h1 class="login-title">
        <o-icon icon="folder-open" pack="fas" size="large"></o-icon>
        <br>
        文件管理器
      </h1>
      
      <o-field label="用户名">
        <o-input v-model="username" placeholder="请输入用户名" @keyup.enter="login"></o-input>
      </o-field>
      
      <o-field label="密码">
        <o-input v-model="password" type="password" placeholder="请输入密码" password-reveal @keyup.enter="login"></o-input>
      </o-field>
      
      <o-button variant="primary" expanded @click="login" :loading="loading">
        登录
      </o-button>
      
      <p class="has-text-centered" style="margin-top: 15px;">
        还没有账号？
        <router-link to="/register">立即注册</router-link>
      </p>
      
      <div class="notification is-info" style="margin-top: 20px;">
        <strong>默认账号：</strong><br>
        管理员: admin / admin123<br>
        普通用户: user / user123<br>
        只读用户: viewer / viewer123
      </div>
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
const password = ref('')
const loading = ref(false)

async function login() {
  if (!username.value || !password.value) {
    return
  }
  
  loading.value = true
  const result = await authStore.login(username.value, password.value)
  loading.value = false
  
  if (result.success) {
    router.push('/')
  } else {
    alert(result.error)
  }
}
</script>
