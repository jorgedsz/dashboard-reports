import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportsAPI } from '../services/api';
import ReactMarkdown from 'react-markdown';
import { Loader2, ArrowLeft, Trash2, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function ReportViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const fetchReport = async () => {
    try {
      const res = await reportsAPI.get(id);
      setReport(res.data);
      if (res.data.status === 'completed' || res.data.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {
      if (pollRef.current) clearInterval(pollRef.current);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    pollRef.current = setInterval(fetchReport, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este reporte?')) return;
    await reportsAPI.delete(id);
    navigate('/reports');
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;
  if (!report) return <div className="text-center py-12 text-gray-500">Reporte no encontrado</div>;

  const statusConfig = {
    pending: { icon: <Clock size={18} className="text-yellow-400" />, label: 'Pendiente' },
    processing: { icon: <Loader2 size={18} className="animate-spin text-orange-400" />, label: 'Procesando' },
    completed: { icon: <CheckCircle size={18} className="text-green-400" />, label: 'Completado' },
    failed: { icon: <XCircle size={18} className="text-red-400" />, label: 'Fallido' },
  };

  const typesDisplay = report.conversationTypes?.length > 0 ? report.conversationTypes.join(', ') : 'Todos los tipos';

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/reports')} className="text-gray-400 hover:text-gray-200"><ArrowLeft size={20} /></button>
        <h1 className="text-2xl font-bold flex-1">{report.title}</h1>
        <button onClick={handleDelete} className="text-red-400 hover:text-red-300"><Trash2 size={20} /></button>
      </div>

      <div className="glass p-4 mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">{statusConfig[report.status]?.icon}<span>{statusConfig[report.status]?.label || report.status}</span></div>
        <div><span className="text-gray-500">Fuente:</span> {report.sourceType === 'twilio' ? 'Twilio' : 'GHL'} — {report.clientName}</div>
        <div><span className="text-gray-500">Rango:</span> {new Date(report.dateFrom).toLocaleDateString()} — {new Date(report.dateTo).toLocaleDateString()}</div>
        <div><span className="text-gray-500">Tipos:</span> {typesDisplay}</div>
        <div><span className="text-gray-500">{report.sourceType === 'twilio' ? 'Llamadas' : 'Conversaciones'}:</span> {report.totalConversations}</div>
      </div>

      <div className="glass p-4 mb-6">
        <p className="text-xs text-gray-500 mb-1">Prompt de análisis:</p>
        <p className="text-sm text-gray-300">{report.prompt}</p>
      </div>

      {report.status === 'processing' && (
        <div className="glass p-8 text-center">
          <Loader2 size={32} className="animate-spin text-orange-400 mx-auto mb-4" />
          <p className="text-gray-400">{report.progressMessage || 'Procesando...'}</p>
        </div>
      )}

      {report.status === 'failed' && (
        <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-xl">
          <p className="text-red-400 font-medium">Error al generar el reporte</p>
          <p className="text-sm text-red-400/70 mt-1">{report.error}</p>
        </div>
      )}

      {report.status === 'completed' && report.result && (
        <div className="glass p-6 prose prose-invert prose-orange max-w-none">
          <ReactMarkdown>{report.result}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
