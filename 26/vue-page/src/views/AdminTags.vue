<template>
  <div class="admin-tags">
    <div class="container">
      <div class="page-header">
        <h1>标签管理</h1>
        <router-link to="/admin" class="btn btn-default">返回</router-link>
      </div>
      <div class="content card">
        <div class="add-form">
          <h3>添加标签</h3>
          <div class="form-row">
            <div class="form-group">
              <input type="text" v-model="newTag.name" placeholder="标签名称" />
            </div>
            <button class="btn btn-primary" @click="addTag">添加</button>
          </div>
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>文章数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tag in tags" :key="tag.id">
              <td>{{ tag.id }}</td>
              <td>
                <input v-if="editingId === tag.id" v-model="editForm.name" />
                <span v-else>{{ tag.name }}</span>
              </td>
              <td>{{ tag.article_count }}</td>
              <td class="actions">
                <button v-if="editingId === tag.id" @click="saveTag(tag.id)">保存</button>
                <button v-else @click="startEdit(tag)">编辑</button>
                <button @click="deleteTag(tag.id)" class="delete">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  data() {
    return {
      tags: [],
      newTag: { name: '' },
      editingId: null,
      editForm: { name: '' }
    }
  },
  mounted() {
    this.loadTags()
  },
  methods: {
    async loadTags() {
      try {
        const res = await axios.get('/api/tags')
        this.tags = res.data
      } catch (e) {
        console.error(e)
      }
    },
    async addTag() {
      if (!this.newTag.name.trim()) return
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        await axios.post('/api/tags', this.newTag, {
          auth: { username: credentials[0], password: credentials[1] }
        })
        this.newTag = { name: '' }
        this.loadTags()
      } catch (e) {
        alert('添加失败')
      }
    },
    startEdit(tag) {
      this.editingId = tag.id
      this.editForm = { name: tag.name }
    },
    async saveTag(id) {
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        await axios.put(`/api/tags/${id}`, this.editForm, {
          auth: { username: credentials[0], password: credentials[1] }
        })
        this.editingId = null
        this.loadTags()
      } catch (e) {
        alert('保存失败')
      }
    },
    async deleteTag(id) {
      if (!confirm('确定删除这个标签吗？')) return
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        await axios.delete(`/api/tags/${id}`, {
          auth: { username: credentials[0], password: credentials[1] }
        })
        this.loadTags()
      } catch (e) {
        alert('删除失败')
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

.add-form {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #ebeef5;
}

.add-form h3 {
  margin-bottom: 15px;
  color: #303133;
}

.form-row {
  display: flex;
  gap: 15px;
  align-items: flex-end;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th,
.admin-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
}

.admin-table th {
  background: #f5f7fa;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 15px;
}

.actions button {
  color: #409eff;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.actions .delete {
  color: #f56c6c;
}
</style>
