import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import styles from './Auth.module.css'

function Register() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  })
  const { register, isLoading, error } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    const result = await register(formData)
    if (result.success) {
      navigate('/')
    }
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>书签管理器</h1>
        <p className={styles.subtitle}>创建您的账号</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.formGroup}>
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              required
              placeholder="请输入用户名"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email">邮箱</label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="请输入邮箱"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">密码</label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              placeholder="至少6位字符"
            />
          </div>

          <button type="submit" className={styles.button} disabled={isLoading}>
            {isLoading ? '注册中...' : '注册'}
          </button>
        </form>

        <p className={styles.footer}>
          已有账号？ <Link to="/login" className={styles.link}>立即登录</Link>
        </p>
      </div>
    </div>
  )
}

export default Register
