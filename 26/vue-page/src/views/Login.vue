<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-card card">
        <h2>管理员登录</h2>
        <form @submit.prevent="login">
          <div class="form-group">
            <label>用户名</label>
            <input type="text" v-model="username" placeholder="请输入用户名" required />
          </div>
          <div class="form-group">
            <label>密码</label>
            <input type="password" v-model="password" placeholder="请输入密码" required />
          </div>
          <button type="submit" class="btn btn-primary login-btn">登录</button>
          <p v-if="error" class="error-message">{{ error }}</p>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  data() {
    return {
      username: '',
      password: '',
      error: ''
    }
  },
  methods: {
    async login() {
      this.error = ''
      try {
        const res = await axios.post('/api/login', {
          username: this.username,
          password: this.password
        })
        if (res.data.success) {
          localStorage.setItem('admin_token', btoa(this.username + ':' + this.password))
          localStorage.setItem('admin_user', JSON.stringify(res.data.user))
          this.$router.push('/admin')
        }
      } catch (e) {
        this.error = e.response?.data?.message || '登录失败'
      }
    }
  }
}
</script>

<style scoped>
.login-page {
  min-height: calc(100vh - 200px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-container {
  width: 400px;
}

.login-card {
  padding: 40px;
}

.login-card h2 {
  text-align: center;
  margin-bottom: 30px;
  color: #303133;
}

.login-btn {
  width: 100%;
  padding: 12px;
  font-size: 16px;
}

.error-message {
  color: #f56c6c;
  text-align: center;
  margin-top: 15px;
  font-size: 14px;
}
</style>
