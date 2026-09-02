import '@/lib/extensions'; // Import all global extensions
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/state'
import { useSettingsStore } from '@/stores/settings'
import { navigationService } from '@/services/navigation'
import { configureTransport } from '@/api/lightrag'
import { Toaster } from 'sonner'
import App from './App'
import LoginPage from '@/features/LoginPage'
import ThemeProvider from '@/components/ThemeProvider'

// Wire the API transport seam to app stores and navigation at module scope so
// the real credentials are in place before any component effect fires a
// request (React runs child effects before parent effects). The getState()
// calls stay lazy — evaluated at each request, not at configuration time.
configureTransport({
  getCredentials: () => ({
    apiKey: useSettingsStore.getState().apiKey,
    isGuestMode: useAuthStore.getState().isGuestMode,
    isAuthenticated: useAuthStore.getState().isAuthenticated,
  }),
  onAuthEvent: (event) => {
    if (event.type === 'guestTokenRefreshed') {
      useAuthStore.getState().login(
        event.token,
        true,
        event.coreVersion,
        event.apiVersion,
        event.webuiTitle,
        event.webuiDescription
      )
    } else if (event.type === 'tokenRenewed') {
      useAuthStore.getState().setTokenRenewal(Date.now(), event.expiresAt)
    } else {
      navigationService.navigateToLogin()
    }
  },
})

const AppContent = () => {
  const [initializing, setInitializing] = useState(true)
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  // Set navigate function for navigation service
  useEffect(() => {
    navigationService.setNavigate(navigate)
  }, [navigate])

  // Token validity check
  useEffect(() => {

    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('LIGHTRAG-API-TOKEN')

        if (token && isAuthenticated) {
          setInitializing(false);
          return;
        }

        if (!token) {
          useAuthStore.getState().logout()
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        if (!isAuthenticated) {
          useAuthStore.getState().logout()
        }
      } finally {
        setInitializing(false)
      }
    }

    checkAuth()

    return () => {
    }
  }, [isAuthenticated])

  // Redirect effect for protected routes
  useEffect(() => {
    if (!initializing && !isAuthenticated) {
      const currentPath = window.location.hash.slice(1);
      if (currentPath !== '/login') {
        console.log('Not authenticated, redirecting to login');
        navigate('/login');
      }
    }
  }, [initializing, isAuthenticated, navigate]);

  // Show nothing while initializing
  if (initializing) {
    return null
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={isAuthenticated ? <App /> : null}
      />
    </Routes>
  )
}

const AppRouter = () => {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
        <Toaster
          position="bottom-center"
          theme="system"
          closeButton
          richColors
        />
      </Router>
    </ThemeProvider>
  )
}

export default AppRouter
