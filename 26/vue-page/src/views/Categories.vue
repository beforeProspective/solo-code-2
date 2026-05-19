<template>
  <div class="categories-page">
    <div class="container">
      <h1 class="page-title">文章分类</h1>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else>
        <div v-if="categories.length === 0" class="loading">暂无分类</div>
        <div class="category-grid">
          <router-link 
            v-for="category in categories" 
            :key="category.id" 
            :to="`/category/${category.id}`"
            class="category-card card"
          >
            <h3>{{ category.name }}</h3>
            <p v-if="category.description">{{ category.description }}</p>
            <span class="article-count">{{ category.article_count }} 篇文章</span>
          </router-link>
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
      categories: [],
      loading: true
    }
  },
  mounted() {
    this.loadCategories()
  },
  methods: {
    async loadCategories() {
      this.loading = true
      try {
        const res = await axios.get('/api/categories')
        this.categories = res.data
      } catch (e) {
        console.error(e)
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.page-title {
  margin-bottom: 30px;
  color: #303133;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.category-card {
  text-align: center;
  transition: transform 0.3s, box-shadow 0.3s;
}

.category-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.category-card h3 {
  color: #303133;
  margin-bottom: 10px;
}

.category-card p {
  color: #606266;
  font-size: 14px;
  margin-bottom: 15px;
}

.article-count {
  color: #409eff;
  font-size: 13px;
}
</style>
