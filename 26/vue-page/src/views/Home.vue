<template>
  <div class="home">
    <div class="container">
      <div class="search-bar">
        <input 
          type="text" 
          v-model="keyword" 
          placeholder="搜索文章..." 
          @keyup.enter="search"
        />
        <button class="btn btn-primary" @click="search">搜索</button>
      </div>
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
              <span> · 点赞 {{ article.like_count }}</span>
            </div>
            <p class="article-summary">{{ article.summary }}</p>
            <div class="article-tags">
              <router-link 
                v-for="tag in article.tags" 
                :key="tag.id" 
                :to="`/tag/${tag.id}`"
                class="tag"
              >
                #{{ tag.name }}
              </router-link>
            </div>
          </div>
          <div class="pagination">
            <button 
              class="btn btn-default" 
              :disabled="page <= 1" 
              @click="changePage(page - 1)"
            >
              上一页
            </button>
            <span>第 {{ page }} 页 / 共 {{ pages }} 页</span>
            <button 
              class="btn btn-default" 
              :disabled="page >= pages" 
              @click="changePage(page + 1)"
            >
              下一页
            </button>
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
      articles: [],
      loading: true,
      page: 1,
      per_page: 10,
      total: 0,
      pages: 0,
      keyword: ''
    }
  },
  mounted() {
    this.loadArticles()
  },
  methods: {
    async loadArticles() {
      this.loading = true
      try {
        const params = {
          page: this.page,
          per_page: this.per_page
        }
        if (this.keyword) {
          params.keyword = this.keyword
        }
        const res = await axios.get('/api/articles', { params })
        this.articles = res.data.articles
        this.total = res.data.total
        this.pages = res.data.pages
      } catch (e) {
        console.error(e)
      } finally {
        this.loading = false
      }
    },
    changePage(p) {
      this.page = p
      this.loadArticles()
    },
    search() {
      this.page = 1
      this.loadArticles()
    }
  }
}
</script>

<style scoped>
.search-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
}

.search-bar input {
  flex: 1;
}

.article-item {
  transition: transform 0.3s, box-shadow 0.3s;
}

.article-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.article-title {
  font-size: 22px;
  margin-bottom: 10px;
  color: #303133;
  transition: color 0.3s;
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
  margin-bottom: 12px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 30px;
}
</style>
