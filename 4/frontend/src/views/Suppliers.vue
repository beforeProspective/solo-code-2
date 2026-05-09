<template>
  <div class="suppliers-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>供应商管理</span>
          <el-button type="primary" @click="openDialog">
            <el-icon><Plus /></el-icon>
            新增供应商
          </el-button>
        </div>
      </template>
      <el-table :data="suppliersList" stripe border>
        <el-table-column prop="name" label="供应商名称" min-width="200" />
        <el-table-column prop="contact_person" label="联系人" width="120" />
        <el-table-column prop="phone" label="电话" width="140" />
        <el-table-column prop="email" label="邮箱" width="200" />
        <el-table-column prop="address" label="地址" min-width="200" />
        <el-table-column prop="website" label="网站" width="200">
          <template #default="{ row }">
            <a :href="row.website" target="_blank" v-if="row.website">{{ row.website }}</a>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="rating" label="评分" width="100">
          <template #default="{ row }">
            <el-rate v-if="row.rating" :model-value="row.rating" disabled :max="5" />
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="editSupplier(row)">编辑</el-button>
            <el-button type="danger" link @click="deleteSupplier(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑供应商' : '新增供应商'"
      width="600px"
    >
      <el-form :model="formData" label-width="100px">
        <el-form-item label="供应商名称" required>
          <el-input v-model="formData.name" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="联系人">
              <el-input v-model="formData.contact_person" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话">
              <el-input v-model="formData.phone" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="邮箱">
          <el-input v-model="formData.email" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input type="textarea" v-model="formData.address" :rows="2" />
        </el-form-item>
        <el-form-item label="网站">
          <el-input v-model="formData.website" placeholder="https://" />
        </el-form-item>
        <el-form-item label="评分">
          <el-rate v-model="formData.rating" :max="5" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input type="textarea" v-model="formData.notes" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSupplier">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { suppliersAPI } from '../api'

const suppliersList = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref(null)

const formData = reactive({
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  website: '',
  rating: null,
  notes: ''
})

const loadData = async () => {
  try {
    const res = await suppliersAPI.getAll()
    suppliersList.value = res.data.results || res.data
  } catch (error) {
    ElMessage.error('加载数据失败')
  }
}

const openDialog = () => {
  resetForm()
  isEdit.value = false
  dialogVisible.value = true
}

const editSupplier = (row) => {
  resetForm()
  isEdit.value = true
  currentId.value = row.id
  Object.assign(formData, row)
  dialogVisible.value = true
}

const resetForm = () => {
  Object.assign(formData, {
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    rating: null,
    notes: ''
  })
}

const saveSupplier = async () => {
  try {
    if (!formData.name) {
      ElMessage.warning('请填写供应商名称')
      return
    }
    if (isEdit.value) {
      await suppliersAPI.update(currentId.value, formData)
      ElMessage.success('更新成功')
    } else {
      await suppliersAPI.create(formData)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const deleteSupplier = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要删除供应商 ${row.name} 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await suppliersAPI.delete(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
