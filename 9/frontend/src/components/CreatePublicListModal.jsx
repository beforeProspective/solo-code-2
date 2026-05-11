import { useState } from 'react'
import useBookmarkStore from '../store/bookmarkStore'
import styles from './Modal.module.css'

function CreatePublicListModal({ onClose, onRefresh }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState(null)
  const [createdList, setCreatedList] = useState(null)
  const { createPublicList } = useBookmarkStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('请输入列表标题')
      return
    }

    setIsCreating(true)
    setError(null)

    const result = await createPublicList({
      title: title.trim(),
      description: description.trim(),
      bookmark_ids: [],
    })

    setIsCreating(false)

    if (result.success) {
      setCreatedList(result.data)
      onRefresh()
    } else {
      setError('创建失败，请重试')
    }
  }

  const copyShareLink = () => {
    if (createdList) {
      const shareUrl = `${window.location.origin}/share/${createdList.share_token}`
      navigator.clipboard.writeText(shareUrl)
      alert('分享链接已复制到剪贴板！')
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>创建分享列表</h2>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>

        {createdList ? (
          <div className={styles.successContent}>
            <div className={styles.successIcon}>✅</div>
            <h3 className={styles.successTitle}>创建成功！</h3>
            <div className={styles.shareInfo}>
              <p className={styles.shareLabel}>分享链接：</p>
              <div className={styles.shareLink}>
                <span>{`${window.location.origin}/share/${createdList.share_token}`}</span>
                <button onClick={copyShareLink} className={styles.smallButton}>
                  复制
                </button>
              </div>
            </div>
            <div className={styles.footer}>
              <button onClick={onClose} className={styles.buttonPrimary}>
                完成
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.formGroup}>
              <label htmlFor="title">列表标题</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="例如：我的收藏夹"
                className={styles.input}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="description">描述（可选）</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="简单描述这个列表..."
                className={styles.textarea}
              />
            </div>

            <div className={styles.info}>
              <p>📢 公开列表将分享您所有的非归档书签</p>
            </div>

            <div className={styles.footer}>
              <button type="button" onClick={onClose} className={styles.buttonSecondary}>
                取消
              </button>
              <button type="submit" className={styles.buttonPrimary} disabled={!title || isCreating}>
                {isCreating ? '创建中...' : '创建列表'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default CreatePublicListModal
