import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, Phone, FilePlus, FileText, LogOut } from 'lucide-react';

const links = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/clients', label: 'Clientes GHL', icon: Users },
  { to: '/twilio-accounts', label: 'Cuentas Twilio', icon: Phone },
  { to: '/reports/new', label: 'Nuevo Reporte', icon: FilePlus },
  { to: '/reports', label: 'Historial', icon: FileText },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-900/80 border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-bold" style={{ color: '#E8792F' }}>GHL Reports</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  isActive ? 'bg-orange-500/20 text-orange-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-sm text-gray-500 mb-2">{user?.email}</p>
          <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors">
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 dot-bg overflow-auto">
        <div className="p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
