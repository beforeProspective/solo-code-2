<template>
  <div class="admin-page">
    <div class="container">
      <div class="admin-header">
        <h1>文章管理</h1>
        <div class="admin-actions">
          <router-link to="/admin/article/new" class="btn btn-primary">写文章</router-link>
          <router-link to="/admin/categories" class="btn btn-default">分类管理</router-link>
          <router-link to="/admin/tags" class="btn btn-default">标签管理</router-link>
          <router-link to="/admin/settings" class="btn btn-default">网站设置</router-link>
          <button class="btn btn-danger" @click="logout">退出</button>
        </div>
      </div>
      <div class="admin-content card">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else>
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>标题</th>
                <th>分类</th>
                <th>浏览</th>
                <th>点赞</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="article in articles" :key="article.id">
                <td>{{ article.id }}</td>
                <td>{{ article.title }}</td>
                <td>{{ article.category?.name || '-' }}</td>
                <td>{{ article.views }}</td>
                <td>{{ article.like_count }}</td>
                <td>
                  <span :class="['status', article.is_published ? 'published' : 'draft']">
                    {{ article.is_published ? '已发布' : '草稿' }}
                  </span>
                </td>
                <td>{{ article.created_at.split('T')[0] }}</td>
                <td class="actions">
                  <router-link :to="`/article/${article.id}`" target="_blank">查看</router-link>
                  <router-link :to="`/admin/article/${article.id}/edit`">编辑</router-link>
                  <button @click="deleteArticle(article.id)" class="delete">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
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
      articles: [],
      loading: true
    }
  },
  mounted() {
    this.loadArticles()
  },
  methods: {
    async loadArticles() {
      this.loading = true
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        const res = await axios.get('/api/admin/articles', {
          auth: {
            username: credentials[0],
            password: credentials[1]
          }
        })
        this.articles = res.data.articles
      } catch (e) {
        if (e.response?.status === 401) {
          this.logout()
        }
      } finally {
        this.loading = false
      }
    },
    async deleteArticle(id) {
      if (!confirm('确定删除这篇文章吗？')) return
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        await axios.delete(`/api/articles/${id}`, {
          auth: {
            username: credentials[0],
            password: credentials[1]
          }
        })
        this.loadArticles()
      } catch (e) {
        alert('删除失败')
      }
    },
    logout() {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      this.$router.push('/login')
    }
  }
}
</script>

<style scoped>
.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.admin-header h1 {
  color: #303133;
}

.admin-actions {
  display: flex;
  gap: 10px;
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
  color: #303133;
}

.admin-table tr:hover {
  background: #fafafa;
}

.status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status.published {
  background: #f0f9eb;
  color: #67c23a;
}

.status.draft {
  background: #fdf6ec;
  color: #e6a23c;
}

.actions {
  display: flex;
  gap: 15px;
}

.actions a,
.actions button {
  color: #409eff;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.actions .delete {
  color: #f56c6c;
}

.actions a:hover,
.actions button:hover {
  text-decoration: underline;
}
</style>
