import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { clientsAPI, reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Users, FileText, Sparkles, Loader2, CheckCircle, Clock, XCircle } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ clients: 0, reports: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([clientsAPI.list(), reportsAPI.list()])
      .then(([clientsRes, reportsRes]) => {
        setStats({ clients: clientsRes.data.length, reports: reportsRes.data });
      })
      .finally(() => setLoading(false));
  }, []);

  const statusIcon = {
    pending: <Clock size={14} className="text-yellow-400" />,
    processing: <Loader2 size={14} className="animate-spin text-orange-400" />,
    completed: <CheckCircle size={14} className="text-green-400" />,
    failed: <XCircle size={14} className="text-red-400" />,
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;

  const recentReports = stats.reports.slice(0, 5);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Welcome, {user?.name}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="glass p-6 flex items-center gap-4">
          <Users size={28} style={{ color: '#E8792F' }} />
          <div>
            <p className="text-2xl font-bold">{stats.clients}</p>
            <p className="text-sm text-gray-500">GHL Clients</p>
          </div>
        </div>
        <div className="glass p-6 flex items-center gap-4">
          <FileText size={28} style={{ color: '#E8792F' }} />
          <div>
            <p className="text-2xl font-bold">{stats.reports.length}</p>
            <p className="text-sm text-gray-500">Total Reports</p>
          </div>
        </div>
        <Link to="/reports/new" className="glass p-6 flex items-center gap-4 hover:bg-white/10 transition-colors">
          <Sparkles size={28} style={{ color: '#E8792F' }} />
          <div>
            <p className="font-semibold">Generate Report</p>
            <p className="text-sm text-gray-500">Create a new analysis</p>
          </div>
        </Link>
      </div>

      <h2 className="text-lg font-semibold mb-4">Recent Reports</h2>
      {recentReports.length === 0 ? (
        <div className="glass p-8 text-center text-gray-500">No reports yet</div>
      ) : (
        <div className="space-y-2">
          {recentReports.map((r) => (
            <Link key={r.id} to={`/reports/${r.id}`} className="glass p-4 flex items-center justify-between hover:bg-white/10 transition-colors block">
              <div className="flex items-center gap-3">
                {statusIcon[r.status]}
                <div>
                  <h3 className="font-medium text-sm">{r.title}</h3>
                  <p className="text-xs text-gray-500">{r.clientName} &bull; {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <span className="text-xs text-gray-500 capitalize">{r.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
