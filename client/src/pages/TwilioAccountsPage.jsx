import { useState, useEffect } from 'react';
import { twilioAPI } from '../services/api';
import { Plus, Trash2, TestTube, Pencil, X, Loader2 } from 'lucide-react';

export default function TwilioAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', accountSid: '', authToken: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const fetchAccounts = async () => {
    try {
      const res = await twilioAPI.list();
      setAccounts(res.data);
    } catch {
      setError('Error al cargar las cuentas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await twilioAPI.update(editingId, form);
      } else {
        await twilioAPI.create(form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', accountSid: '', authToken: '' });
      fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar la cuenta');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account) => {
    setEditingId(account.id);
    setForm({ name: account.name, accountSid: '', authToken: '' });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta cuenta? Todos los reportes asociados tambien se eliminaran.')) return;
    try {
      await twilioAPI.delete(id);
      fetchAccounts();
    } catch {
      setError('Error al eliminar la cuenta');
    }
  };

  const handleTest = async (id) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await twilioAPI.test(id);
      setTestResult({ id, ...res.data });
    } catch {
      setTestResult({ id, success: false, message: 'Error en la prueba' });
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cuentas Twilio</h1>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', accountSid: '', authToken: '' }); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Agregar Cuenta
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4">{error}</div>}

      {showForm && (
        <div className="glass p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{editingId ? 'Editar Cuenta' : 'Agregar Nueva Cuenta'}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-200"><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nombre de la Cuenta</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="ej. Mi Cuenta Twilio" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Account SID {editingId && '(dejar vacio para mantener el actual)'}</label>
              <input type="password" value={form.accountSid} onChange={(e) => setForm({ ...form, accountSid: e.target.value })} className="input-field" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required={!editingId} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Auth Token {editingId && '(dejar vacio para mantener el actual)'}</label>
              <input type="password" value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} className="input-field" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required={!editingId} />
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : editingId ? 'Actualizar Cuenta' : 'Agregar Cuenta'}
            </button>
          </form>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="glass p-12 text-center text-gray-500">
          <p>Aun no hay cuentas Twilio registradas.</p>
          <p className="text-sm mt-1">Haz clic en "Agregar Cuenta" para comenzar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="glass p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium">{account.name}</h3>
                <p className="text-sm text-gray-500">Creada: {new Date(account.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                {testResult?.id === account.id && (
                  <span className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {testResult.message}
                  </span>
                )}
                <button onClick={() => handleTest(account.id)} disabled={testing === account.id} className="btn-secondary flex items-center gap-1 text-sm">
                  {testing === account.id ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                  Probar
                </button>
                <button onClick={() => handleEdit(account)} className="btn-secondary flex items-center gap-1 text-sm">
                  <Pencil size={14} /> Editar
                </button>
                <button onClick={() => handleDelete(account.id)} className="text-red-400 hover:text-red-300 p-2">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
