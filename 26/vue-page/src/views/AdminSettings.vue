<template>
  <div class="admin-settings">
    <div class="container">
      <div class="page-header">
        <h1>网站设置</h1>
        <router-link to="/admin" class="btn btn-default">返回</router-link>
      </div>
      <div class="content card">
        <div class="form-group">
          <label>网站名称</label>
          <input type="text" v-model="settings.site_name" placeholder="请输入网站名称" />
        </div>
        <div class="form-group">
          <label>网站描述</label>
          <textarea v-model="settings.site_description" placeholder="请输入网站描述" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>网站关键词</label>
          <input type="text" v-model="settings.site_keywords" placeholder="请输入网站关键词，用逗号分隔" />
        </div>
        <div class="form-group">
          <label>版权信息</label>
          <input type="text" v-model="settings.copyright_text" placeholder="请输入版权信息" />
        </div>
        <div class="form-group">
          <label>ICP备案号</label>
          <input type="text" v-model="settings.icp_number" placeholder="请输入ICP备案号（可选）" />
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" @click="saveSettings">保存设置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  data() {
    return {
      settings: {
        site_name: '',
        site_description: '',
        site_keywords: '',
        copyright_text: '',
        icp_number: ''
      }
    }
  },
  mounted() {
    this.loadSettings()
  },
  methods: {
    async loadSettings() {
      try {
        const res = await axios.get('/api/settings')
        this.settings = res.data
      } catch (e) {
        console.error(e)
      }
    },
    async saveSettings() {
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        await axios.put('/api/settings', this.settings, {
          auth: { username: credentials[0], password: credentials[1] }
        })
        alert('设置保存成功')
      } catch (e) {
        alert('保存失败')
      }
    }
  }
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.form-actions {
  margin-top: 30px;
}
</style>
