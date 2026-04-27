import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { reportsAPI } from '../services/api';
import { Loader2, Trash2, Clock, CheckCircle, XCircle, FileText } from 'lucide-react';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    try {
      const res = await reportsAPI.list();
      setReports(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this report?')) return;
    await reportsAPI.delete(id);
    fetchReports();
  };

  const statusIcon = {
    pending: <Clock size={16} className="text-yellow-400" />,
    processing: <Loader2 size={16} className="animate-spin text-orange-400" />,
    completed: <CheckCircle size={16} className="text-green-400" />,
    failed: <XCircle size={16} className="text-red-400" />,
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Report History</h1>
        <Link to="/reports/new" className="btn-primary">New Report</Link>
      </div>

      {reports.length === 0 ? (
        <div className="glass p-12 text-center text-gray-500">
          <FileText size={48} className="mx-auto mb-4 opacity-50" />
          <p>No reports yet.</p>
          <p className="text-sm mt-1">Generate your first report to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Link key={r.id} to={`/reports/${r.id}`} className="glass p-4 flex items-center justify-between hover:bg-white/10 transition-colors block">
              <div className="flex items-center gap-3">
                {statusIcon[r.status]}
                <div>
                  <h3 className="font-medium">{r.title}</h3>
                  <p className="text-sm text-gray-500">
                    {r.clientName} &bull; {new Date(r.dateFrom).toLocaleDateString()} — {new Date(r.dateTo).toLocaleDateString()} &bull; {r.totalConversations} conversations
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</span>
                <button onClick={(e) => { e.preventDefault(); handleDelete(r.id); }} className="text-red-400 hover:text-red-300">
                  <Trash2 size={16} />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
