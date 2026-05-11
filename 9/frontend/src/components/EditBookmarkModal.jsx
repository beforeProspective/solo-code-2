import { useState } from 'react'
import useBookmarkStore from '../store/bookmarkStore'
import styles from './Modal.module.css'

function EditBookmarkModal({ bookmark, categories, onClose }) {
  const [title, setTitle] = useState(bookmark.title || '')
  const [description, setDescription] = useState(bookmark.description || '')
  const [categoryId, setCategoryId] = useState(bookmark.category?.id?.toString() || '')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState(bookmark.tags?.map((t) => t.name) || [])
  const { updateBookmark, addCategory } = useBookmarkStore()
  const [isLoading, setIsLoading] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.type === 'click') {
      e.preventDefault()
      const tag = tagInput.trim()
      if (tag && !tags.includes(tag)) {
        setTags([...tags, tag])
        setTagInput('')
      }
    }
  }

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const handleCreateCategory = async () => {
    if (newCategoryName.trim()) {
      const result = await addCategory(newCategoryName.trim())
      if (result.success) {
        setCategoryId(result.data.id.toString())
        setNewCategoryName('')
        setShowNewCategory(false)
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)

    const result = await updateBookmark(bookmark.id, {
      title,
      description,
      category_id: categoryId ? parseInt(categoryId) : null,
      tags,
    })

    setIsLoading(false)
    if (result.success) {
      onClose()
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>编辑书签</h2>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="url">URL</label>
            <input
              id="url"
              type="url"
              value={bookmark.url}
              disabled
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="title">标题</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="description">描述</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={styles.textarea}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="category">分类</label>
            {showNewCategory ? (
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="新分类名称"
                  className={styles.input}
                />
                <button type="button" onClick={handleCreateCategory} className={styles.smallButton}>
                  创建
                </button>
                <button type="button" onClick={() => setShowNewCategory(false)} className={styles.smallButtonSecondary}>
                  取消
                </button>
              </div>
            ) : (
              <div className={styles.inputGroup}>
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={styles.select}
                >
                  <option value="">无分类</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowNewCategory(true)} className={styles.smallButton}>
                  + 新分类
                </button>
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>标签</label>
            <div className={styles.inputGroup}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleAddTag}
                placeholder="按回车添加标签"
                className={styles.input}
              />
              <button type="button" onClick={handleAddTag} className={styles.smallButton}>
                添加
              </button>
            </div>
            {tags.length > 0 && (
              <div className={styles.tagList}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    #{tag}
                    <button type="button" onClick={() => removeTag(tag)} className={styles.removeTag}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <button type="button" onClick={onClose} className={styles.buttonSecondary}>
              取消
            </button>
            <button type="submit" className={styles.buttonPrimary} disabled={isLoading}>
              {isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditBookmarkModal
