import styles from './Sidebar.module.css'

function Sidebar({
  user,
  categories,
  tags,
  publicLists,
  activeView,
  onViewChange,
  onLogout,
  onAddBookmark,
  onImportExport,
  onCreatePublicList,
}) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🔖</span>
        <span className={styles.logoText}>书签管理器</span>
      </div>

      <button onClick={onAddBookmark} className={styles.addButton}>
        + 添加书签
      </button>

      <nav className={styles.nav}>
        <div className={styles.navSection}>
          <NavItem
            icon="📚"
            label="全部书签"
            active={activeView === 'all'}
            onClick={() => onViewChange('all')}
          />
          <NavItem
            icon="⭐"
            label="收藏夹"
            active={activeView === 'favorites'}
            onClick={() => onViewChange('favorites')}
          />
          <NavItem
            icon="📦"
            label="归档"
            active={activeView === 'archived'}
            onClick={() => onViewChange('archived')}
          />
        </div>

        {categories.length > 0 && (
          <div className={styles.navSection}>
            <h3 className={styles.sectionTitle}>分类</h3>
            {categories.map((category) => (
              <NavItem
                key={category.id}
                icon="📁"
                label={category.name}
                color={category.color}
                active={activeView === `category-${category.id}`}
                onClick={() => onViewChange(`category-${category.id}`)}
              />
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className={styles.navSection}>
            <h3 className={styles.sectionTitle}>标签</h3>
            <div className={styles.tagList}>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className={`${styles.tag} ${activeView === `tag-${tag.id}` ? styles.tagActive : ''}`}
                  onClick={() => onViewChange(`tag-${tag.id}`)}
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {publicLists.length > 0 && (
          <div className={styles.navSection}>
            <h3 className={styles.sectionTitle}>公开列表</h3>
            {publicLists.map((list) => (
              <div key={list.id} className={styles.publicListItem}>
                <span className={styles.publicListName}>🔗 {list.title}</span>
                <span className={styles.shareToken}>{list.share_token.slice(0, 8)}...</span>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div className={styles.actions}>
        <button onClick={onImportExport} className={styles.actionButton}>
          📤 导入/导出
        </button>
        <button onClick={onCreatePublicList} className={styles.actionButton}>
          🔗 创建分享列表
        </button>
      </div>

      <div className={styles.userSection}>
        <div className={styles.userInfo}>
          <div className={styles.userAvatar}>
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div>
            <div className={styles.userName}>{user?.username}</div>
            <div className={styles.userEmail}>{user?.email}</div>
          </div>
        </div>
        <button onClick={onLogout} className={styles.logoutButton}>
          退出登录
        </button>
      </div>
    </aside>
  )
}

function NavItem({ icon, label, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
    >
      <span className={styles.navIcon} style={{ color: color }}>
        {icon}
      </span>
      <span className={styles.navLabel}>{label}</span>
    </button>
  )
}

export default Sidebar
