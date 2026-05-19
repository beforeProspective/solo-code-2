<template>
  <div class="tag-articles">
    <div class="container">
      <h1 class="page-title">#{{ tag?.name || '标签文章' }}</h1>
      <div class="article-list">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="articles.length === 0" class="loading">暂无文章</div>
        <div v-else>
          <div v-for="article in articles" :key="article.id" class="article-item card">
            <router-link :to="`/article/${article.id}`">
              <h2 class="article-title">{{ article.title }}</h2>
            </router-link>
            <div class="article-meta">
              <span>{{ article.created_at.split('T')[0] }}</span>
              <span v-if="article.category"> · {{ article.category.name }}</span>
              <span> · 浏览 {{ article.views }}</span>
            </div>
            <p class="article-summary">{{ article.summary }}</p>
          </div>
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
      tag: null,
      articles: [],
      loading: true
    }
  },
  mounted() {
    this.loadData()
  },
  methods: {
    async loadData() {
      this.loading = true
      try {
        const [tagRes, artRes] = await Promise.all([
          axios.get('/api/tags'),
          axios.get('/api/articles', { 
            params: { tag_id: this.$route.params.id, per_page: 100 } 
          })
        ])
        this.tag = tagRes.data.find(t => t.id === parseInt(this.$route.params.id))
        this.articles = artRes.data.articles
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

.article-item {
  transition: transform 0.3s, box-shadow 0.3s;
}

.article-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.article-title {
  font-size: 20px;
  margin-bottom: 10px;
  color: #303133;
}

.article-title:hover {
  color: #409eff;
}

.article-meta {
  color: #909399;
  font-size: 13px;
  margin-bottom: 12px;
}

.article-summary {
  color: #606266;
  line-height: 1.8;
}
</style>
