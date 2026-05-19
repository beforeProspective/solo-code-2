<template>
  <div class="article-detail">
    <div class="container">
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else class="article-content card">
        <h1 class="article-title">{{ article.title }}</h1>
        <div class="article-meta">
          <span>{{ article.created_at.split('T')[0] }}</span>
          <span v-if="article.category"> · {{ article.category.name }}</span>
          <span> · 浏览 {{ article.views }}</span>
        </div>
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
        <div class="article-body" v-html="renderedContent"></div>
        <div class="like-section">
          <button 
            class="btn like-btn" 
            :class="{ liked: isLiked }"
            @click="likeArticle"
            :disabled="isLiked"
          >
            {{ isLiked ? '已点赞' : '点赞' }} ({{ likeCount }})
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'
import { marked } from 'marked'

export default {
  data() {
    return {
      article: {
        title: '',
        content: '',
        created_at: '',
        views: 0,
        category: null,
        tags: []
      },
      loading: true,
      isLiked: false,
      likeCount: 0
    }
  },
  computed: {
    renderedContent() {
      return marked(this.article.content || '')
    }
  },
  mounted() {
    this.loadArticle()
    this.checkLike()
  },
  methods: {
    async loadArticle() {
      this.loading = true
      try {
        const res = await axios.get(`/api/articles/${this.$route.params.id}`)
        this.article = res.data
        this.likeCount = res.data.like_count
      } catch (e) {
        console.error(e)
      } finally {
        this.loading = false
      }
    },
    async checkLike() {
      try {
        const res = await axios.get(`/api/articles/${this.$route.params.id}/like`)
        this.isLiked = res.data.liked
        this.likeCount = res.data.like_count
      } catch (e) {
        console.error(e)
      }
    },
    async likeArticle() {
      try {
        const res = await axios.post(`/api/articles/${this.$route.params.id}/like`)
        this.isLiked = res.data.liked
        this.likeCount = res.data.like_count
      } catch (e) {
        alert('点赞失败')
      }
    }
  }
}
</script>

<style scoped>
.article-content {
  padding: 40px;
}

.article-title {
  font-size: 32px;
  margin-bottom: 20px;
  color: #303133;
}

.article-meta {
  color: #909399;
  font-size: 14px;
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #ebeef5;
}

.article-tags {
  margin-bottom: 30px;
}

.article-body {
  font-size: 16px;
  line-height: 2;
  color: #303133;
}

.article-body :deep(h1),
.article-body :deep(h2),
.article-body :deep(h3) {
  margin: 30px 0 15px;
  color: #303133;
}

.article-body :deep(p) {
  margin: 15px 0;
}

.article-body :deep(code) {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: Consolas, Monaco, monospace;
}

.article-body :deep(pre) {
  background: #282c34;
  color: #abb2bf;
  padding: 20px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 20px 0;
}

.article-body :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.article-body :deep(blockquote) {
  border-left: 4px solid #409eff;
  padding-left: 20px;
  margin: 20px 0;
  color: #606266;
  background: #f5f7fa;
  padding: 15px 20px;
}

.like-section {
  margin-top: 40px;
  padding-top: 30px;
  border-top: 1px solid #ebeef5;
  text-align: center;
}

.like-btn {
  background: #f56c6c;
  color: white;
  padding: 12px 30px;
  font-size: 16px;
  border-radius: 25px;
}

.like-btn:hover {
  background: #f78989;
}

.like-btn.liked {
  background: #909399;
  cursor: not-allowed;
}
</style>
