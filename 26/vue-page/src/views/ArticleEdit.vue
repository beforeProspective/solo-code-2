<template>
  <div class="article-edit">
    <div class="container">
      <h1 class="page-title">{{ isEdit ? '编辑文章' : '新建文章' }}</h1>
      <div class="edit-form card">
        <div class="form-group">
          <label>标题</label>
          <input type="text" v-model="form.title" placeholder="请输入文章标题" />
        </div>
        <div class="form-group">
          <label>摘要</label>
          <textarea v-model="form.summary" placeholder="请输入文章摘要" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>封面图URL</label>
          <input type="text" v-model="form.cover_image" placeholder="请输入封面图URL（可选）" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>分类</label>
            <select v-model="form.category_id">
              <option :value="null">请选择分类</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>标签</label>
            <div class="tag-select">
              <label v-for="tag in tags" :key="tag.id" class="tag-checkbox">
                <input type="checkbox" :value="tag.id" v-model="form.tag_ids" />
                {{ tag.name }}
              </label>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>内容（支持Markdown）</label>
          <textarea v-model="form.content" placeholder="请输入文章内容，支持Markdown语法" rows="20"></textarea>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.is_published" />
            立即发布
          </label>
        </div>
        <div class="form-actions">
          <button class="btn btn-default" @click="$router.back()">取消</button>
          <button class="btn btn-primary" @click="save">保存</button>
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
      isEdit: false,
      categories: [],
      tags: [],
      form: {
        title: '',
        summary: '',
        content: '',
        cover_image: '',
        category_id: null,
        tag_ids: [],
        is_published: true
      }
    }
  },
  mounted() {
    this.isEdit = !!this.$route.params.id
    this.loadData()
  },
  methods: {
    async loadData() {
      try {
        const [catRes, tagRes] = await Promise.all([
          axios.get('/api/categories'),
          axios.get('/api/tags')
        ])
        this.categories = catRes.data
        this.tags = tagRes.data
        
        if (this.isEdit) {
          const articleRes = await axios.get(`/api/articles/${this.$route.params.id}`)
          const article = articleRes.data
          this.form = {
            title: article.title,
            summary: article.summary || '',
            content: article.content,
            cover_image: article.cover_image || '',
            category_id: article.category?.id || null,
            tag_ids: article.tags.map(t => t.id),
            is_published: article.is_published
          }
        }
      } catch (e) {
        console.error(e)
      }
    },
    async save() {
      try {
        const token = localStorage.getItem('admin_token')
        const credentials = atob(token).split(':')
        const auth = {
          username: credentials[0],
          password: credentials[1]
        }
        
        if (this.isEdit) {
          await axios.put(`/api/articles/${this.$route.params.id}`, this.form, { auth })
        } else {
          await axios.post('/api/articles', this.form, { auth })
        }
        this.$router.push('/admin')
      } catch (e) {
        alert('保存失败')
      }
    }
  }
}
</script>

<style scoped>
.page-title {
  margin-bottom: 20px;
  color: #303133;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 20px;
}

.tag-select {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}

.tag-checkbox {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font-weight: normal;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: normal;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  margin-top: 30px;
}
</style>
