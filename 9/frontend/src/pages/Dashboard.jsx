import { useState, useEffect } from 'react'
import useAuthStore from '../store/authStore'
import useBookmarkStore from '../store/bookmarkStore'
import Sidebar from '../components/Sidebar'
import BookmarkCard from '../components/BookmarkCard'
import AddBookmarkModal from '../components/AddBookmarkModal'
import ImportExportModal from '../components/ImportExportModal'
import CreatePublicListModal from '../components/CreatePublicListModal'
import styles from './Dashboard.module.css'

function Dashboard() {
  const { user, logout } = useAuthStore()
  const {
    bookmarks,
    categories,
    tags,
    publicLists,
    fetchBookmarks,
    fetchCategories,
    fetchTags,
    fetchPublicLists,
    isLoading,
  } = useBookmarkStore()

  const [activeView, setActiveView] = useState('all')
  const [filters, setFilters] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [showPublicListModal, setShowPublicListModal] = useState(false)

  useEffect(() => {
    fetchCategories()
    fetchTags()
    fetchPublicLists()
  }, [])

  useEffect(() => {
    const newFilters = {}
    if (searchQuery) newFilters.search = searchQuery
    
    switch (activeView) {
      case 'favorites':
        newFilters.is_favorite = true
        break
      case 'archived':
        newFilters.is_archived = true
        break
      case 'all':
      default:
        newFilters.is_archived = false
    }
    
    if (activeView.startsWith('category-')) {
      newFilters.category_id = activeView.replace('category-', '')
      newFilters.is_archived = false
    }
    
    if (activeView.startsWith('tag-')) {
      newFilters.tag_id = activeView.replace('tag-', '')
      newFilters.is_archived = false
    }

    setFilters(newFilters)
  }, [activeView, searchQuery])

  useEffect(() => {
    fetchBookmarks(filters)
  }, [filters])

  const handleLogout = () => {
    logout()
  }

  return (
    <div className={styles.container}>
      <Sidebar
        user={user}
        categories={categories}
        tags={tags}
        publicLists={publicLists}
        activeView={activeView}
        onViewChange={setActiveView}
        onLogout={handleLogout}
        onAddBookmark={() => setShowAddModal(true)}
        onImportExport={() => setShowImportExport(true)}
        onCreatePublicList={() => setShowPublicListModal(true)}
      />

      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h2 className={styles.pageTitle}>
              {getViewTitle(activeView, categories, tags)}
            </h2>
            <div className={styles.searchBox}>
              <input
                type="text"
                placeholder="搜索书签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>
        </header>

        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>加载中...</div>
          ) : bookmarks.length === 0 ? (
            <div className={styles.empty}>
              <h3>还没有书签</h3>
              <p>点击左侧"添加书签"开始收藏</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {bookmarks.map((bookmark) => (
                <BookmarkCard key={bookmark.id} bookmark={bookmark} />
              ))}
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <AddBookmarkModal
          onClose={() => setShowAddModal(false)}
          categories={categories}
        />
      )}

      {showImportExport && (
        <ImportExportModal
          onClose={() => setShowImportExport(false)}
          onRefresh={() => fetchBookmarks(filters)}
        />
      )}

      {showPublicListModal && (
        <CreatePublicListModal
          onClose={() => setShowPublicListModal(false)}
          onRefresh={() => fetchPublicLists()}
        />
      )}
    </div>
  )
}

function getViewTitle(view, categories, tags) {
  if (view === 'all') return '全部书签'
  if (view === 'favorites') return '收藏夹'
  if (view === 'archived') return '归档'
  if (view.startsWith('category-')) {
    const id = view.replace('category-', '')
    const category = categories.find((c) => c.id === parseInt(id))
    return category?.name || '分类'
  }
  if (view.startsWith('tag-')) {
    const id = view.replace('tag-', '')
    const tag = tags.find((t) => t.id === parseInt(id))
    return `#${tag?.name || '标签'}`
  }
  return '书签'
}

export default Dashboard
