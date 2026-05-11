import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import styles from './SharedList.module.css'

function SharedList() {
  const { token } = useParams()
  const [listData, setListData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchList = async () => {
      try {
        const response = await api.get(`/public-lists/share/${token}`)
        setListData(response.data)
      } catch (err) {
        setError(err.response?.data?.detail || '加载失败')
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      fetchList()
    }
  }, [token])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>加载中...</div>
      </div>
    )
  }

  if (error || !listData) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <h2>列表不存在</h2>
          <p>{error || '该分享链接无效或已被删除'}</p>
          <Link to="/login" className={styles.link}>
            登录书签管理器
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <span className={styles.logo}>🔖 书签管理器</span>
          <Link to="/login" className={styles.loginLink}>登录</Link>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.listHeader}>
          <h1 className={styles.title}>{listData.title}</h1>
          {listData.description && (
            <p className={styles.description}>{listData.description}</p>
          )}
          <p className={styles.count}>
            共 {listData.bookmarks.length} 个书签
          </p>
        </div>

        {listData.bookmarks.length === 0 ? (
          <div className={styles.empty}>
            <p>这个列表还没有书签</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {listData.bookmarks.map((bookmark) => (
              <div key={bookmark.id} className={styles.card}>
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
                  <h3 className={styles.bookmarkTitle}>
                    <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                      {bookmark.title || bookmark.url}
                    </a>
                  </h3>
                  <div className={styles.url}>
                    {new URL(bookmark.url).hostname}
                  </div>
                  {bookmark.description && (
                    <p className={styles.bookmarkDescription}>
                      {bookmark.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default SharedList
