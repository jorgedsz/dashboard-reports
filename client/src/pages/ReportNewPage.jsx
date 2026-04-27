import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientsAPI, reportsAPI } from '../services/api';
import { Loader2, Sparkles } from 'lucide-react';

const MESSAGE_TYPES = [
  { value: 'TYPE_SMS', label: 'SMS' },
  { value: 'TYPE_EMAIL', label: 'Email' },
  { value: 'TYPE_CALL', label: 'Phone Calls' },
  { value: 'TYPE_FB', label: 'Facebook Messenger' },
  { value: 'TYPE_INSTAGRAM', label: 'Instagram' },
  { value: 'TYPE_WHATSAPP', label: 'WhatsApp' },
  { value: 'TYPE_LIVE_CHAT', label: 'Live Chat' },
  { value: 'TYPE_GMB', label: 'Google Business' },
];

const PROMPT_EXAMPLES = [
  'Analyze customer sentiment across all conversations. Identify common complaints, praise points, and overall satisfaction trends.',
  'Find all unresolved conversations where the last message was from the customer. List them with context.',
  'Identify the top objections customers raise and suggest improvements for handling each one.',
  'Create a performance report: response times, conversation resolution, and areas for improvement.',
];

export default function ReportNewPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    ghlClientId: '',
    title: '',
    dateFrom: '',
    dateTo: '',
    conversationTypes: [],
    prompt: '',
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    clientsAPI.list().then((res) => {
      setClients(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
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
    if (!form.ghlClientId || !form.dateFrom || !form.dateTo || !form.prompt) {
      setError('Please fill in all required fields');
      return;
    }
    setGenerating(true);
    try {
      const res = await reportsAPI.generate({
        ...form,
        ghlClientId: parseInt(form.ghlClientId),
      });
      navigate(`/reports/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start report');
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Generate Report</h1>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4">{error}</div>}

      {clients.length === 0 ? (
        <div className="glass p-12 text-center text-gray-500">
          <p>No GHL clients registered yet.</p>
          <p className="text-sm mt-2">Go to <a href="/clients" className="text-orange-400 hover:underline">GHL Clients</a> to add one first.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">1. Select Client</h2>
            <select value={form.ghlClientId} onChange={(e) => setForm({ ...form, ghlClientId: e.target.value })} className="input-field" required>
              <option value="">Choose a GHL client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.locationId})</option>
              ))}
            </select>
          </div>

          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">2. Date Range</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">From</label>
                <input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">To</label>
                <input type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} className="input-field" required />
              </div>
            </div>
          </div>

          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-2">3. Message Types</h2>
            <p className="text-sm text-gray-500 mb-4">Filter by message type. Leave all unchecked to include all messages.</p>
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

          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">4. Analysis Prompt</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Report Title (optional)</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field mb-4" placeholder="e.g. Weekly Sentiment Analysis" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">What do you want to analyze?</label>
              <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="input-field h-32 resize-y" placeholder="Describe the report you want..." required />
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">Example prompts:</p>
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
            {generating ? 'Starting...' : 'Generate Report'}
          </button>
        </form>
      )}
    </div>
  );
}
