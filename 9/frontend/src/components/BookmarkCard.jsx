import { useState } from 'react'
import useBookmarkStore from '../store/bookmarkStore'
import EditBookmarkModal from './EditBookmarkModal'
import styles from './BookmarkCard.module.css'

function BookmarkCard({ bookmark }) {
  const { toggleFavorite, toggleArchive, deleteBookmark, categories } = useBookmarkStore()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const handleFavorite = async () => {
    await toggleFavorite(bookmark.id)
  }

  const handleArchive = async () => {
    await toggleArchive(bookmark.id)
  }

  const handleDelete = async () => {
    if (window.confirm('确定要删除这个书签吗？')) {
      await deleteBookmark(bookmark.id)
    }
    setShowMenu(false)
  }

  const domain = new URL(bookmark.url).hostname

  return (
    <>
      <div className={`${styles.card} ${bookmark.is_archived ? styles.archived : ''}`}>
        {bookmark.thumbnail ? (
          <div className={styles.thumbnail}>
            <img src={bookmark.thumbnail} alt={bookmark.title} />
          </div>
        ) : (
          <div className={styles.thumbnailPlaceholder}>
            <span>🔗</span>
          </div>
        )}

        <div className={styles.content}>
          <div className={styles.header}>
            <h3 className={styles.title} title={bookmark.title}>
              <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                {bookmark.title || bookmark.url}
              </a>
            </h3>
            <div className={styles.actions}>
              <button
                onClick={handleFavorite}
                className={`${styles.iconButton} ${bookmark.is_favorite ? styles.favorited : ''}`}
                title={bookmark.is_favorite ? '取消收藏' : '添加收藏'}
              >
                {bookmark.is_favorite ? '⭐' : '☆'}
              </button>
              <div className={styles.menu}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className={styles.iconButton}
                  title="更多操作"
                >
                  ⋮
                </button>
                {showMenu && (
                  <div className={styles.menuDropdown}>
                    <button onClick={() => { setShowEditModal(true); setShowMenu(false) }}>
                      ✏️ 编辑
                    </button>
                    <button onClick={handleArchive}>
                      {bookmark.is_archived ? '📤 取消归档' : '📦 归档'}
                    </button>
                    <button onClick={handleDelete} className={styles.deleteButton}>
                      🗑️ 删除
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.url} title={bookmark.url}>
            {domain}
          </div>

          {bookmark.description && (
            <p className={styles.description} title={bookmark.description}>
              {bookmark.description}
            </p>
          )}

          <div className={styles.footer}>
            {bookmark.category && (
              <span
                className={styles.category}
                style={{ backgroundColor: bookmark.category.color + '20', color: bookmark.category.color }}
              >
                {bookmark.category.name}
              </span>
            )}
            {bookmark.tags?.length > 0 && (
              <div className={styles.tags}>
                {bookmark.tags.slice(0, 3).map((tag) => (
                  <span key={tag.id} className={styles.tag}>
                    #{tag.name}
                  </span>
                ))}
                {bookmark.tags.length > 3 && (
                  <span className={styles.tagMore}>+{bookmark.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditModal && (
        <EditBookmarkModal
          bookmark={bookmark}
          categories={categories}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

export default BookmarkCard
