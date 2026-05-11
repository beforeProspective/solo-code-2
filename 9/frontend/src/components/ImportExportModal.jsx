import { useState, useRef } from 'react'
import useBookmarkStore from '../store/bookmarkStore'
import styles from './Modal.module.css'

function ImportExportModal({ onClose, onRefresh }) {
  const [activeTab, setActiveTab] = useState('import')
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const { importBookmarks, exportBookmarks } = useBookmarkStore()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setError(null)
    setImportResult(null)

    const result = await importBookmarks(file)

    if (result.success) {
      setImportResult(result.data)
      onRefresh()
    } else {
      setError('导入失败，请检查文件格式')
    }

    setIsImporting(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    setError(null)

    const result = await exportBookmarks()

    if (!result.success) {
      setError('导出失败')
    }

    setIsExporting(false)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>导入 / 导出</h2>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>

        <div className={styles.tabs}>
          <button
            onClick={() => { setActiveTab('import'); setImportResult(null); setError(null) }}
            className={`${styles.tab} ${activeTab === 'import' ? styles.tabActive : ''}`}
          >
            导入
          </button>
          <button
            onClick={() => { setActiveTab('export'); setError(null) }}
            className={`${styles.tab} ${activeTab === 'export' ? styles.tabActive : ''}`}
          >
            导出
          </button>
        </div>

        {activeTab === 'import' ? (
          <div className={styles.importExportContent}>
            {error && <div className={styles.error}>{error}</div>}
            {importResult && (
              <div className={styles.success}>
                成功导入 {importResult.imported_count} 个书签
                {importResult.total_parsed > importResult.imported_count && (
                  <span>（{importResult.total_parsed - importResult.imported_count} 个已存在，跳过）</span>
                )}
              </div>
            )}
            <div className={styles.dropZone}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleFileChange}
                className={styles.fileInput}
              />
              <div className={styles.dropZoneContent}>
                <div className={styles.dropZoneIcon}>📁</div>
                <p className={styles.dropZoneText}>
                  点击或拖拽 HTML 书签文件到此处
                </p>
                <p className={styles.dropZoneHint}>
                  支持从 Chrome、Firefox、Safari 等浏览器导出的 HTML 文件
                </p>
              </div>
            </div>
            {isImporting && <div className={styles.loading}>导入中...</div>}
          </div>
        ) : (
          <div className={styles.importExportContent}>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.exportInfo}>
              <div className={styles.exportIcon}>📤</div>
              <p className={styles.exportText}>
                将您的所有书签导出为标准 HTML 格式
              </p>
              <p className={styles.exportHint}>
                导出的文件可以导入到任何主流浏览器中
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={styles.buttonPrimary}
            >
              {isExporting ? '导出中...' : '导出书签'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImportExportModal
