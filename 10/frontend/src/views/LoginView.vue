<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h2><i class="pi pi-microchip" style="font-size: 2rem; margin-right: 0.5rem;"></i> 电子元器件管理系统</h2>
        <p>请登录以访问系统</p>
      </div>
      
      <div class="tab-buttons">
        <button 
          :class="['tab-btn', { active: activeTab === 'login' }]" 
          @click="activeTab = 'login'"
        >
          登录
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'register' }]" 
          @click="activeTab = 'register'"
        >
          注册
        </button>
      </div>
      
      <div v-show="activeTab === 'login'" class="form-container">
        <form @submit.prevent="handleLogin">
          <div class="form-field">
            <label for="login-username">用户名</label>
            <InputText 
              id="login-username" 
              v-model="loginForm.username" 
              type="text" 
              placeholder="请输入用户名"
              required
            />
          </div>
          
          <div class="form-field">
            <label for="login-password">密码</label>
            <InputText 
              id="login-password" 
              v-model="loginForm.password" 
              type="password" 
              placeholder="请输入密码"
              required
            />
          </div>
          
          <Button 
            type="submit" 
            label="登录" 
            icon="pi pi-sign-in" 
            class="w-full mt-4"
            :loading="authStore.isLoading"
          />
        </form>
        
        <div class="hint-text">
          <p><strong>默认账号：</strong></p>
          <p>管理员: admin / admin123</p>
          <p>普通用户: user / user123</p>
        </div>
      </div>
      
      <div v-show="activeTab === 'register'" class="form-container">
        <form @submit.prevent="handleRegister">
          <div class="form-field">
            <label for="reg-username">用户名</label>
            <InputText 
              id="reg-username" 
              v-model="registerForm.username" 
              type="text" 
              placeholder="请输入用户名"
              required
            />
          </div>
          
          <div class="form-field">
            <label for="reg-email">邮箱</label>
            <InputText 
              id="reg-email" 
              v-model="registerForm.email" 
              type="email" 
              placeholder="请输入邮箱"
              required
            />
          </div>
          
          <div class="form-field">
            <label for="reg-password">密码</label>
            <InputText 
              id="reg-password" 
              v-model="registerForm.password" 
              type="password" 
              placeholder="请输入密码（至少6位）"
              required
            />
          </div>
          
          <Button 
            type="submit" 
            label="注册" 
            icon="pi pi-user-plus" 
            class="w-full mt-4"
            :loading="authStore.isLoading"
          />
        </form>
      </div>
      
      <div v-if="authStore.error" class="error-message">
        <i class="pi pi-exclamation-triangle"></i> {{ authStore.error }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const activeTab = ref('login')

const loginForm = reactive({
  username: 'admin',
  password: 'admin123'
})

const registerForm = reactive({
  username: '',
  email: '',
  password: ''
})

const handleLogin = async () => {
  authStore.error = null
  const result = await authStore.login(loginForm)
  
  if (result.success) {
    toast.add({ severity: 'success', summary: '登录成功', detail: `欢迎回来，${authStore.user.username}！`, life: 3000 })
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  }
}

const handleRegister = async () => {
  authStore.error = null
  const result = await authStore.register(registerForm)
  
  if (result.success) {
    toast.add({ severity: 'success', summary: '注册成功', detail: '欢迎加入！', life: 3000 })
    router.push('/')
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
}

.login-card {
  width: 100%;
  max-width: 450px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.login-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  text-align: center;
}

.login-header h2 {
  margin: 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-header p {
  margin: 0.5rem 0 0;
  opacity: 0.9;
}

.tab-buttons {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
}

.tab-btn {
  flex: 1;
  padding: 1rem;
  border: none;
  background: none;
  font-size: 1rem;
  cursor: pointer;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn.active {
  color: #667eea;
  border-bottom-color: #667eea;
  font-weight: 600;
}

.form-container {
  padding: 2rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
}

.hint-text {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
  font-size: 0.875rem;
  color: #6b7280;
}

.hint-text p {
  margin: 0.25rem 0;
}

.w-full {
  width: 100%;
}

.mt-4 {
  margin-top: 1rem;
}

.error-message {
  background: #fef2f2;
  color: #dc2626;
  padding: 0.75rem 1rem;
  border-top: 1px solid #fecaca;
  text-align: center;
}
</style>
