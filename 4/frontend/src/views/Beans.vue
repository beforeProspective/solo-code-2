<template>
  <div class="beans-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>生豆库存管理</span>
          <el-button type="primary" @click="openDialog">
            <el-icon><Plus /></el-icon>
            新增生豆
          </el-button>
        </div>
      </template>
      <el-table :data="beansList" stripe border>
        <el-table-column prop="name" label="生豆名称" min-width="180" />
        <el-table-column prop="origin_country" label="原产国" width="100" />
        <el-table-column prop="region" label="产区" width="120" />
        <el-table-column prop="variety" label="品种" width="100" />
        <el-table-column prop="process_method" label="处理法" width="100" />
        <el-table-column prop="altitude" label="海拔" width="100" />
        <el-table-column prop="supplier_name" label="供应商" width="120" />
        <el-table-column prop="total_weight" label="总重量(kg)" width="110">
          <template #default="{ row }">
            {{ Number(row.total_weight).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="remaining_weight" label="剩余(kg)" width="100">
          <template #default="{ row }">
            <el-tag :type="row.remaining_weight <= 1 ? 'danger' : 'success'">
              {{ Number(row.remaining_weight).toFixed(2) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="unit_price" label="单价(元/kg)" width="110">
          <template #default="{ row }">
            {{ row.unit_price ? Number(row.unit_price).toFixed(2) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="editBean(row)">编辑</el-button>
            <el-button type="danger" link @click="deleteBean(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑生豆' : '新增生豆'"
      width="700px"
    >
      <el-form :model="formData" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="生豆名称" required>
              <el-input v-model="formData.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="原产国" required>
              <el-input v-model="formData.origin_country" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="产区">
              <el-input v-model="formData.region" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="庄园">
              <el-input v-model="formData.farm" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="品种">
              <el-input v-model="formData.variety" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="处理法">
              <el-input v-model="formData.process_method" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="海拔">
              <el-input v-model="formData.altitude" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="杯测分数">
              <el-input-number v-model="formData.cupping_score" :precision="2" :min="0" :max="100" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="供应商">
              <el-select v-model="formData.supplier" placeholder="请选择" clearable style="width: 100%">
                <el-option
                  v-for="supplier in suppliersList"
                  :key="supplier.id"
                  :label="supplier.name"
                  :value="supplier.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="采购日期">
              <el-date-picker
                v-model="formData.purchase_date"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="总重量(kg)" required>
              <el-input-number v-model="formData.total_weight" :precision="2" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="剩余重量(kg)" required>
              <el-input-number v-model="formData.remaining_weight" :precision="2" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="单价(元/kg)">
          <el-input-number v-model="formData.unit_price" :precision="2" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input type="textarea" v-model="formData.notes" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveBean">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { beansAPI, suppliersAPI } from '../api'

const beansList = ref([])
const suppliersList = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref(null)

const formData = reactive({
  name: '',
  origin_country: '',
  region: '',
  farm: '',
  variety: '',
  process_method: '',
  altitude: '',
  cupping_score: null,
  supplier: null,
  purchase_date: null,
  total_weight: null,
  remaining_weight: null,
  unit_price: null,
  notes: ''
})

const loadData = async () => {
  try {
    const [beansRes, suppliersRes] = await Promise.all([
      beansAPI.getAll(),
      suppliersAPI.getAll()
    ])
    beansList.value = beansRes.data.results || beansRes.data
    suppliersList.value = suppliersRes.data.results || suppliersRes.data
  } catch (error) {
    ElMessage.error('加载数据失败')
  }
}

const openDialog = () => {
  resetForm()
  isEdit.value = false
  dialogVisible.value = true
}

const editBean = (row) => {
  resetForm()
  isEdit.value = true
  currentId.value = row.id
  Object.assign(formData, row)
  formData.supplier = row.supplier
  dialogVisible.value = true
}

const resetForm = () => {
  Object.assign(formData, {
    name: '',
    origin_country: '',
    region: '',
    farm: '',
    variety: '',
    process_method: '',
    altitude: '',
    cupping_score: null,
    supplier: null,
    purchase_date: null,
    total_weight: null,
    remaining_weight: null,
    unit_price: null,
    notes: ''
  })
}

const saveBean = async () => {
  try {
    if (!formData.name || !formData.origin_country || formData.total_weight === null || formData.remaining_weight === null) {
      ElMessage.warning('请填写必填字段')
      return
    }
    if (isEdit.value) {
      await beansAPI.update(currentId.value, formData)
      ElMessage.success('更新成功')
    } else {
      await beansAPI.create(formData)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const deleteBean = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要删除 ${row.name} 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await beansAPI.delete(row.id)
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
