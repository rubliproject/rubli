import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthField, AuthErrorPill } from '@/components/auth/AuthField'

export default function RegisterPage() {
  const { t } = useTranslation('auth')
  const { register } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError(t('register.passwordsMismatch'))
      return
    }
    if (password.length < 8) {
      setError(t('register.passwordTooShort'))
      return
    }

    setSubmitting(true)
    try {
      await register(email, password, name)
      navigate('/workspace')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title={t('register.title')} lede={t('lede.register')} crumb={t('register.submit')}>
      <form onSubmit={handleSubmit} noValidate className="au-form">
        <div className="au-pair">
        <AuthField
          id="register-name"
          label={t('register.nameLabel')}
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('register.namePlaceholder')}
        />
        <AuthField
          id="register-email"
          label={t('register.emailLabel')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('register.emailPlaceholder')}
        />
        </div>
        <div className="au-pair">
        <AuthField
          id="register-password"
          label={t('register.passwordLabel')}
          type="password"
          autoComplete="new-password"
          required
          mono
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('register.passwordPlaceholder')}
        />
        <AuthField
          id="register-confirm"
          label={t('register.confirmPasswordLabel')}
          type="password"
          autoComplete="new-password"
          required
          mono
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t('register.confirmPasswordPlaceholder')}
        />
        </div>

        {error && <AuthErrorPill message={error} />}

        <button type="submit" disabled={submitting} className="au-submit">
          {submitting ? t('register.submitting') : t('register.submit')}
        </button>
        <p className="au-alt">
          {t('register.hasAccount')}{' '}
          <Link to="/login" className="ct-link">
            {t('register.signIn')}
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
