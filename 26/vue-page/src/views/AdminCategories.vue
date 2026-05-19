<template>
  <div class="admin-categories">
    <div class="container">
      <div class="page-header">
        <h1>分类管理</h1>
        <router-link to="/admin" class="btn btn-default">返回</router-link>
      </div>
      <div class="content card">
        <div class="add-form">
          <h3>添加分类</h3>
          <div class="form-row">
            <div class="form-group">
              <input type="text" v-model="newCategory.name" placeholder="分类名称" />
            </div>
            <div class="form-group">
              <input type="text" v-model="newCategory.description" placeholder="分类描述（可选）" />
            </div>
            <button class="btn btn-primary" @click="addCategory">添加</button>
          </div>
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>描述</th>
              <th>文章数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cat in categories" :key="cat.id">
              <td>{{ cat.id }}</td>
              <td>
                <input v-if="editingId === cat.id" v-model="editForm.name" />
                <span v-else>{{ cat.name }}</span>
              </td>
              <td>
                <input v-if="editingId === cat.id" v-model="editForm.description" />
                <span v-else>{{ cat.description || '-' }}</span>
              </td>
              <td>{{ cat.article_count }}</td>
              <td class="actions">
                <button v-if="editingId === cat.id" @click="saveCategory(cat.id)">保存</button>
                <button v-else @click="startEdit(cat)">编辑</button>
                <button @click="deleteCategory(cat.id)" class="delete">删除</button>
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
      categories: [],
      newCategory: { name: '', description: '' },
      editingId: null,
      editForm: { name: '', description: '' }
    }
  },
  mounted() {
    this.loadCategories()
  },
  methods: {
    async loadCategories() {
      try {
        const res = await axios.get('/api/categories')
        this.categories = res.data
      } catch (e) {
        console.error(e)
      }
    },
    async addCategory() {
      if (!this.newCategory.name.trim()) return
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        await axios.post('/api/categories', this.newCategory, {
          auth: { username: credentials[0], password: credentials[1] }
        })
        this.newCategory = { name: '', description: '' }
        this.loadCategories()
      } catch (e) {
        alert('添加失败')
      }
    },
    startEdit(cat) {
      this.editingId = cat.id
      this.editForm = { name: cat.name, description: cat.description || '' }
    },
    async saveCategory(id) {
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        await axios.put(`/api/categories/${id}`, this.editForm, {
          auth: { username: credentials[0], password: credentials[1] }
        })
        this.editingId = null
        this.loadCategories()
      } catch (e) {
        alert('保存失败')
      }
    },
    async deleteCategory(id) {
      if (!confirm('确定删除这个分类吗？删除后该分类下的文章将变为无分类。')) return
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        await axios.delete(`/api/categories/${id}`, {
          auth: { username: credentials[0], password: credentials[1] }
        })
        this.loadCategories()
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
