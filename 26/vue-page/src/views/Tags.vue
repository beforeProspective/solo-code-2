<template>
  <div class="tags-page">
    <div class="container">
      <h1 class="page-title">文章标签</h1>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else>
        <div v-if="tags.length === 0" class="loading">暂无标签</div>
        <div class="tag-cloud">
          <router-link 
            v-for="tag in tags" 
            :key="tag.id" 
            :to="`/tag/${tag.id}`"
            class="tag-item"
            :style="{ fontSize: Math.min(14 + tag.article_count * 2, 28) + 'px' }"
          >
            #{{ tag.name }} ({{ tag.article_count }})
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
      tags: [],
      loading: true
    }
  },
  mounted() {
    this.loadTags()
  },
  methods: {
    async loadTags() {
      this.loading = true
      try {
        const res = await axios.get('/api/tags')
        this.tags = res.data
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

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  justify-content: center;
  padding: 20px;
}

.tag-item {
  display: inline-block;
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 25px;
  transition: transform 0.3s, box-shadow 0.3s;
}

.tag-item:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
}
</style>
