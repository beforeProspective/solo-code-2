<template>
  <div class="home">
    <div class="hero">
      <h1>电子合同签署平台</h1>
      <p class="subtitle">安全、便捷、高效的在线合同签署解决方案</p>
      <div class="hero-actions">
        <el-button type="primary" size="large" @click="$router.push('/upload')">
          <el-icon><Upload /></el-icon>
          立即上传合同
        </el-button>
        <el-button size="large" @click="$router.push('/contracts')">
          <el-icon><Document /></el-icon>
          查看合同列表
        </el-button>
      </div>
    </div>

    <div class="features">
      <div class="feature-card">
        <el-icon :size="48" color="#409EFF"><Upload /></el-icon>
        <h3>快速上传</h3>
        <p>支持 PDF 格式合同文件快速上传，自动解析页码</p>
      </div>
      <div class="feature-card">
        <el-icon :size="48" color="#67C23A"><Position /></el-icon>
        <h3>位置指定</h3>
        <p>可视化指定签名位置，支持多页多签署人</p>
      </div>
      <div class="feature-card">
        <el-icon :size="48" color="#E6A23C"><Link /></el-icon>
        <h3>签署链接</h3>
        <p>生成唯一签署链接，安全发送给签署人</p>
      </div>
      <div class="feature-card">
        <el-icon :size="48" color="#F56C6C"><EditPen /></el-icon>
        <h3>手写签名</h3>
        <p>支持手写板绘制签名，真实还原手写效果</p>
      </div>
      <div class="feature-card">
        <el-icon :size="48" color="#909399"><DocumentAdd /></el-icon>
        <h3>自动合成</h3>
        <p>系统自动将签名合成到 PDF 中，生成最终文件</p>
      </div>
      <div class="feature-card">
        <el-icon :size="48" color="#409EFF"><Download /></el-icon>
        <h3>便捷下载</h3>
        <p>所有签署完成后，一键下载已签署的合同</p>
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.home {
  max-width: 1200px;
  margin: 0 auto;
}

.hero {
  text-align: center;
  padding: 60px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  color: white;
  margin-bottom: 40px;
}

.hero h1 {
  font-size: 42px;
  margin-bottom: 16px;
}

.subtitle {
  font-size: 18px;
  opacity: 0.9;
  margin-bottom: 30px;
}

.hero-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.feature-card {
  background: white;
  padding: 30px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  transition: transform 0.3s, box-shadow 0.3s;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.feature-card h3 {
  margin: 16px 0 8px;
  font-size: 18px;
}

.feature-card p {
  color: #666;
  font-size: 14px;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .features {
    grid-template-columns: 1fr;
  }
  
  .hero h1 {
    font-size: 28px;
  }
}
</style>
