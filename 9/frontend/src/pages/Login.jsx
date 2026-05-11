import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import styles from './Auth.module.css'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { login, isLoading, error } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    const result = await login(username, password)
    if (result.success) {
      navigate('/')
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>书签管理器</h1>
        <p className={styles.subtitle}>登录以管理您的书签</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.formGroup}>
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="请输入用户名"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="请输入密码"
            />
          </div>

          <button type="submit" className={styles.button} disabled={isLoading}>
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className={styles.footer}>
          还没有账号？ <Link to="/register" className={styles.link}>立即注册</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
