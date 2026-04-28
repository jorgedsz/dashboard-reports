import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientsAPI, twilioAPI, reportsAPI } from '../services/api';
import { Loader2, Sparkles } from 'lucide-react';

const MESSAGE_TYPES = [
  { value: 'TYPE_SMS', label: 'SMS' },
  { value: 'TYPE_EMAIL', label: 'Correo electronico' },
  { value: 'TYPE_CALL', label: 'Llamadas telefonicas' },
  { value: 'TYPE_FB', label: 'Facebook Messenger' },
  { value: 'TYPE_INSTAGRAM', label: 'Instagram' },
  { value: 'TYPE_WHATSAPP', label: 'WhatsApp' },
  { value: 'TYPE_LIVE_CHAT', label: 'Chat en vivo' },
  { value: 'TYPE_GMB', label: 'Google Business' },
];

const PROMPT_EXAMPLES = [
  'Analiza el sentimiento de los clientes en todas las conversaciones. Identifica quejas comunes, puntos positivos y tendencias de satisfaccion general.',
  'Encuentra todas las conversaciones sin resolver donde el ultimo mensaje fue del cliente. Enumeralas con contexto.',
  'Identifica las principales objeciones que plantean los clientes y sugiere mejoras para manejar cada una.',
  'Crea un reporte de rendimiento: tiempos de respuesta, resolucion de conversaciones y areas de mejora.',
];

export default function ReportNewPage() {
  const [sourceType, setSourceType] = useState('ghl');
  const [ghlClients, setGhlClients] = useState([]);
  const [twilioAccounts, setTwilioAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    ghlClientId: '',
    twilioAccountId: '',
    title: '',
    dateFrom: '',
    dateTo: '',
    conversationTypes: [],
    prompt: '',
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([clientsAPI.list(), twilioAPI.list()])
      .then(([ghlRes, twilioRes]) => {
        setGhlClients(ghlRes.data);
        setTwilioAccounts(twilioRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleType = (type) => {
    setForm((prev) => ({
      ...prev,
      conversationTypes: prev.conversationTypes.includes(type)
        ? prev.conversationTypes.filter((t) => t !== type)
        : [...prev.conversationTypes, type],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (sourceType === 'ghl' && !form.ghlClientId) {
      setError('Por favor selecciona un cliente GHL');
      return;
    }
    if (sourceType === 'twilio' && !form.twilioAccountId) {
      setError('Por favor selecciona una cuenta Twilio');
      return;
    }
    if (!form.dateFrom || !form.dateTo || !form.prompt) {
      setError('Por favor completa todos los campos requeridos');
      return;
    }

    setGenerating(true);
    try {
      const payload = {
        sourceType,
        title: form.title,
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        prompt: form.prompt,
      };
      if (sourceType === 'ghl') {
        payload.ghlClientId = parseInt(form.ghlClientId);
        payload.conversationTypes = form.conversationTypes;
      } else {
        payload.twilioAccountId = parseInt(form.twilioAccountId);
      }
      const res = await reportsAPI.generate(payload);
      navigate(`/reports/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar el reporte');
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;

  const noSources = ghlClients.length === 0 && twilioAccounts.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Generar Reporte</h1>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4">{error}</div>}

      {noSources ? (
        <div className="glass p-12 text-center text-gray-500">
          <p>No hay fuentes de datos registradas.</p>
          <p className="text-sm mt-2">
            Agrega un <a href="/clients" className="text-orange-400 hover:underline">Cliente GHL</a> o una <a href="/twilio-accounts" className="text-orange-400 hover:underline">Cuenta Twilio</a> para comenzar.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">1. Fuente de Datos</h2>
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => setSourceType('ghl')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${sourceType === 'ghl' ? 'bg-orange-500/20 border border-orange-500/40 text-orange-400' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200'}`}>
                GHL
              </button>
              <button type="button" onClick={() => setSourceType('twilio')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${sourceType === 'twilio' ? 'bg-orange-500/20 border border-orange-500/40 text-orange-400' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200'}`}>
                Twilio
              </button>
            </div>

            {sourceType === 'ghl' ? (
              ghlClients.length === 0 ? (
                <p className="text-sm text-gray-500">No hay clientes GHL. <a href="/clients" className="text-orange-400 hover:underline">Agregar uno</a></p>
              ) : (
                <select value={form.ghlClientId} onChange={(e) => setForm({ ...form, ghlClientId: e.target.value })} className="input-field">
                  <option value="">Elige un cliente GHL...</option>
                  {ghlClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.locationId})</option>
                  ))}
                </select>
              )
            ) : (
              twilioAccounts.length === 0 ? (
                <p className="text-sm text-gray-500">No hay cuentas Twilio. <a href="/twilio-accounts" className="text-orange-400 hover:underline">Agregar una</a></p>
              ) : (
                <select value={form.twilioAccountId} onChange={(e) => setForm({ ...form, twilioAccountId: e.target.value })} className="input-field">
                  <option value="">Elige una cuenta Twilio...</option>
                  {twilioAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )
            )}
          </div>

          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">2. Rango de Fechas</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Desde</label>
                <input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Hasta</label>
                <input type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} className="input-field" required />
              </div>
            </div>
          </div>

          {sourceType === 'ghl' && (
            <div className="glass p-6">
              <h2 className="text-lg font-semibold mb-2">3. Tipos de Mensaje</h2>
              <p className="text-sm text-gray-500 mb-4">Filtra por tipo de mensaje. Deja todos sin marcar para incluir todos los mensajes.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MESSAGE_TYPES.map(({ value, label }) => (
                  <label key={value} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                    form.conversationTypes.includes(value) ? 'bg-orange-500/20 border border-orange-500/40' : 'bg-white/5 border border-white/10'
                  }`}>
                    <input type="checkbox" checked={form.conversationTypes.includes(value)} onChange={() => toggleType(value)} className="accent-orange-500" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">{sourceType === 'ghl' ? '4' : '3'}. Prompt de Analisis</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Titulo del Reporte (opcional)</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field mb-4" placeholder="ej. Analisis Semanal de Sentimiento" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Que quieres analizar?</label>
              <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="input-field h-32 resize-y" placeholder="Describe el reporte que deseas..." required />
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">Ejemplos de prompts:</p>
              <div className="space-y-1">
                {PROMPT_EXAMPLES.map((example, i) => (
                  <button key={i} type="button" onClick={() => setForm({ ...form, prompt: example })} className="block text-left text-xs text-gray-400 hover:text-orange-400 transition-colors">
                    &bull; {example}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button type="submit" disabled={generating} className="btn-primary flex items-center gap-2 text-lg px-6 py-3">
            {generating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
            {generating ? 'Iniciando...' : 'Generar Reporte'}
          </button>
        </form>
      )}
    </div>
  );
}
