import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { AuthProvider, homeFor, useAuth } from './lib/auth';
import { SettingsProvider, useSettings } from './lib/settings';
import { LazyMotion, MotionConfig } from 'framer-motion';

const loadMotionFeatures = () => import('./lib/motionFeatures').then((m) => m.default);
import { GraphicsProvider } from './lib/graphics';
import { LocationProvider } from './lib/location';
import { ToastProvider } from './lib/toast';
import type { Role } from './lib/types';
import { Layout } from './components/Layout';
import { WakingBanner } from './components/WakingBanner';
import { RootStage } from './components/three/ThreeVisuals';
import { LoginPage } from './pages/Login';
import { RegisterPage, ForgotPasswordPage, ResetPasswordPage } from './pages/Register';
import { HomePage } from './pages/patient/Home';
import { SearchPage } from './pages/patient/Search';
import { MedicineDetailsPage } from './pages/patient/MedicineDetails';
import { RequestDetailsPage, RequestsPage } from './pages/patient/Requests';
import { OrderTrackingPage, SharedTrackingPage } from './pages/patient/OrderTracking';
import { MapPage } from './pages/patient/MapPage';
import { PharmacyDashboard } from './pages/pharmacy/PharmacyDashboard';
import { DoctorDashboard } from './pages/doctor/DoctorDashboard';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { ProfilePage } from './pages/Profile';
import { OrderSlipPage } from './pages/OrderSlip';
import { NotFoundPage, WaitingPage } from './pages/Misc';
import { PublicLayout } from './components/public/PublicLayout';
import {
  AboutPage,
  FaqPage,
  ForDoctorsPage,
  ForPatientsPage,
  ForPharmaciesPage,
  HowItWorksPage,
  PrivacyPage,
  PublicHome,
  TermsPage,
} from './pages/public/PublicPages';
import { ContactPage } from './pages/public/ContactPage';

// Development only: draws one picture for scripts/render-assets.ts (absent from production builds).
const RenderStudio = import.meta.env.DEV ? lazy(() => import('./render/RenderStudio')) : null;

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
      {RenderStudio && (
        <Route
          path="/render"
          element={
            <Suspense fallback={null}>
              <RenderStudio />
            </Suspense>
          }
        />
      )}
      {/* Public website and sign-in pages (before login). */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<PublicHome />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/patients" element={<ForPatientsPage />} />
        <Route path="/pharmacies" element={<ForPharmaciesPage />} />
        <Route path="/doctors" element={<ForDoctorsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
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
      </Route>

      {/* The app (after login). */}
      <Route element={<Layout />}>
        <Route path="/waiting" element={<WaitingPage />} />

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
          path="/orders/:id/print"
          element={
            <RequireRole roles={['patient', 'pharmacy']}>
              <OrderSlipPage />
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
        <Route
          path="/map"
          element={
            <RequireRole roles={['patient']}>
              <MapPage />
            </RequireRole>
          }
        />
        <Route
          path="/pharmacy"
          element={
            <RequireRole roles={['pharmacy']}>
              <PharmacyDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/doctor"
          element={
            <RequireRole roles={['doctor']}>
              <DoctorDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole roles={['staff']}>
              <AdminDashboard />
            </RequireRole>
          }
        />
        <Route path="/track/:token" element={<SharedTrackingPage />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

/** "Reduce animations" forces reduced motion; otherwise framer-motion follows the OS setting. */
function MotionRoot({ children }: { children: ReactNode }) {
  const { reduceMotion } = useSettings();
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>{children}</MotionConfig>
    </LazyMotion>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <MotionRoot>
        <GraphicsProvider>
          <I18nProvider>
            <AuthProvider>
              <LocationProvider>
                <ToastProvider>
                  <BrowserRouter>
                    <RootStage />
                    <WakingBanner />
                    <AppRoutes />
                  </BrowserRouter>
                </ToastProvider>
              </LocationProvider>
            </AuthProvider>
          </I18nProvider>
        </GraphicsProvider>
      </MotionRoot>
    </SettingsProvider>
  );
}
