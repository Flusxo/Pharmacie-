import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { AuthProvider, homeFor, useAuth } from './lib/auth';
import { SettingsProvider } from './lib/settings';
import { LocationProvider } from './lib/location';
import { ToastProvider } from './lib/toast';
import type { Role } from './lib/types';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { RegisterPage, ForgotPasswordPage, ResetPasswordPage } from './pages/Register';
import { HomePage } from './pages/patient/Home';
import { SearchPage } from './pages/patient/Search';
import { MedicineDetailsPage } from './pages/patient/MedicineDetails';
import { RequestDetailsPage, RequestsPage } from './pages/patient/Requests';
import { OrderTrackingPage, SharedTrackingPage } from './pages/patient/OrderTracking';
import { ProfilePage } from './pages/Profile';
import { LegalPage, NotFoundPage, RootRedirect, WaitingPage } from './pages/Misc';

/** Requires a logged-in user with one of the roles; unverified professionals go to /waiting. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  if ((user.role === 'doctor' || user.role === 'pharmacy') && (!user.verified || user.status !== 'active'))
    return <Navigate to="/waiting" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to={homeFor(user)} replace /> : <>{children}</>;
}

export function AppRoutes() {
  const { ready } = useAuth();
  if (!ready) return null;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/login/staff"
          element={
            <GuestOnly>
              <LoginPage staff />
            </GuestOnly>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnly>
              <RegisterPage />
            </GuestOnly>
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/waiting" element={<WaitingPage />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />

        <Route
          path="/home"
          element={
            <RequireRole roles={['patient']}>
              <HomePage />
            </RequireRole>
          }
        />
        <Route
          path="/search"
          element={
            <RequireRole roles={['patient']}>
              <SearchPage />
            </RequireRole>
          }
        />
        <Route
          path="/medicines/:id"
          element={
            <RequireRole roles={['patient']}>
              <MedicineDetailsPage />
            </RequireRole>
          }
        />
        <Route
          path="/requests"
          element={
            <RequireRole roles={['patient']}>
              <RequestsPage />
            </RequireRole>
          }
        />
        <Route
          path="/requests/:id"
          element={
            <RequireRole roles={['patient']}>
              <RequestDetailsPage />
            </RequireRole>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <RequireRole roles={['patient']}>
              <OrderTrackingPage />
            </RequireRole>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireRole roles={['patient', 'doctor', 'pharmacy', 'staff']}>
              <ProfilePage />
            </RequireRole>
          }
        />
        <Route path="/track/:token" element={<SharedTrackingPage />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <I18nProvider>
        <AuthProvider>
          <LocationProvider>
            <ToastProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </ToastProvider>
          </LocationProvider>
        </AuthProvider>
      </I18nProvider>
    </SettingsProvider>
  );
}
