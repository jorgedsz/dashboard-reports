import { useState, useEffect } from 'react';
import { clientsAPI } from '../services/api';
import { Plus, Trash2, TestTube, Pencil, X, Loader2 } from 'lucide-react';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', bearerToken: '', locationId: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const fetchClients = async () => {
    try {
      const res = await clientsAPI.list();
      setClients(res.data);
    } catch {
      setError('Error al cargar los clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClients(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await clientsAPI.update(editingId, form);
      } else {
        await clientsAPI.create(form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', bearerToken: '', locationId: '' });
      fetchClients();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar el cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (client) => {
    setEditingId(client.id);
    setForm({ name: client.name, bearerToken: '', locationId: client.locationId });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este cliente? Todos los reportes asociados también se eliminarán.')) return;
    try {
      await clientsAPI.delete(id);
      fetchClients();
    } catch {
      setError('Error al eliminar el cliente');
    }
  };

  const handleTest = async (id) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await clientsAPI.test(id);
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
        <h1 className="text-2xl font-bold">Clientes GHL</h1>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', bearerToken: '', locationId: '' }); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Agregar Cliente
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4">{error}</div>}

      {showForm && (
        <div className="glass p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{editingId ? 'Editar Cliente' : 'Agregar Nuevo Cliente'}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-200"><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nombre del Cliente</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="ej. Empresa ABC" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bearer Token {editingId && '(dejar vacío para mantener el actual)'}</label>
              <input type="password" value={form.bearerToken} onChange={(e) => setForm({ ...form, bearerToken: e.target.value })} className="input-field" placeholder="pit-xxxxxxxx..." required={!editingId} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Location ID</label>
              <input type="text" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className="input-field" placeholder="xxxxxxxxxxxxxxxxxx" required />
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : editingId ? 'Actualizar Cliente' : 'Agregar Cliente'}
            </button>
          </form>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="glass p-12 text-center text-gray-500">
          <p>Aún no hay clientes GHL registrados.</p>
          <p className="text-sm mt-1">Haz clic en "Agregar Cliente" para comenzar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <div key={client.id} className="glass p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium">{client.name}</h3>
                <p className="text-sm text-gray-500">Ubicación: {client.locationId}</p>
              </div>
              <div className="flex items-center gap-2">
                {testResult?.id === client.id && (
                  <span className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {testResult.message}
                  </span>
                )}
                <button onClick={() => handleTest(client.id)} disabled={testing === client.id} className="btn-secondary flex items-center gap-1 text-sm">
                  {testing === client.id ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                  Probar
                </button>
                <button onClick={() => handleEdit(client)} className="btn-secondary flex items-center gap-1 text-sm">
                  <Pencil size={14} /> Editar
                </button>
                <button onClick={() => handleDelete(client.id)} className="text-red-400 hover:text-red-300 p-2">
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
