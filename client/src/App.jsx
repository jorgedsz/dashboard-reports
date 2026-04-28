import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ReportNewPage from './pages/ReportNewPage';
import ReportViewPage from './pages/ReportViewPage';
import ReportsPage from './pages/ReportsPage';
import TwilioAccountsPage from './pages/TwilioAccountsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute><Layout><ClientsPage /></Layout></ProtectedRoute>} />
          <Route path="/twilio-accounts" element={<ProtectedRoute><Layout><TwilioAccountsPage /></Layout></ProtectedRoute>} />
          <Route path="/reports/new" element={<ProtectedRoute><Layout><ReportNewPage /></Layout></ProtectedRoute>} />
          <Route path="/reports/:id" element={<ProtectedRoute><Layout><ReportViewPage /></Layout></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Layout><ReportsPage /></Layout></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
