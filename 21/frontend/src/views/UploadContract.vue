<template>
  <div class="upload-page">
    <el-card class="upload-card">
      <template #header>
        <div class="card-header">
          <el-icon :size="24" color="#409EFF"><Upload /></el-icon>
          <h2>上传合同</h2>
        </div>
      </template>

      <el-form :model="form" label-width="100px">
        <el-form-item label="合同标题">
          <el-input 
            v-model="form.title" 
            placeholder="请输入合同标题"
            size="large"
          />
        </el-form-item>

        <el-form-item label="PDF文件">
          <el-upload
            class="uploader"
            drag
            :auto-upload="false"
            :limit="1"
            :on-change="handleFileChange"
            :before-upload="beforeUpload"
            accept=".pdf"
          >
            <el-icon class="uploader-icon" :size="60"><UploadFilled /></el-icon>
            <div class="uploader-text">
              将 PDF 文件拖到此处，或<em>点击选择文件</em>
            </div>
            <template #tip>
              <div class="uploader-tip">仅支持 PDF 格式文件</div>
            </template>
          </el-upload>
        </el-form-item>

        <el-form-item>
          <el-button 
            type="primary" 
            size="large"
            :loading="uploading"
            @click="handleUpload"
            :disabled="!form.title || !form.file"
          >
            上传并继续
          </el-button>
          <el-button size="large" @click="$router.push('/contracts')">
            返回列表
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { contractApi } from '../api'

const router = useRouter()
const uploading = ref(false)
const form = ref({
  title: '',
  file: null
})

const beforeUpload = (file) => {
  const isPDF = file.raw.type === 'application/pdf' || 
                file.name.toLowerCase().endsWith('.pdf')
  if (!isPDF) {
    ElMessage.error('只能上传 PDF 文件！')
    return false
  }
  return true
}

const handleFileChange = (file) => {
  form.value.file = file.raw
}

const handleUpload = async () => {
  if (!form.value.title || !form.value.file) {
    ElMessage.warning('请填写合同标题并选择文件')
    return
  }

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('title', form.value.title)
    formData.append('file', form.value.file)

    const res = await contractApi.upload(formData)
    ElMessage.success('上传成功！')
    router.push(`/contracts/${res.data.id}/setup`)
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '上传失败')
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.upload-page {
  max-width: 600px;
  margin: 0 auto;
}

.upload-card {
  border-radius: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-header h2 {
  margin: 0;
  font-size: 20px;
}

.uploader {
  width: 100%;
}

.uploader-icon {
  color: #8c939d;
}

.uploader-text {
  color: #606266;
  margin: 10px 0;
}

.uploader-text em {
  color: #409eff;
  font-style: normal;
}

.uploader-tip {
  color: #909399;
  font-size: 12px;
}
</style>
