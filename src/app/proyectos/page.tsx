'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { Proyecto } from '@/lib/types';
import Modal from '@/components/Modal';
import Toast from '@/components/Toast';
import {
  Plus,
  FolderOpen,
  MapPin,
  Users,
  LogOut,
  Edit2,
  Trash2,
  ArrowRight,
  Building2,
  Pause,
  CheckCircle2,
  Clock,
} from 'lucide-react';

const ESTADO_CONFIG: Record<Proyecto['estado'], { label: string; color: string; icon: typeof Clock }> = {
  activo: { label: 'Activo', color: 'bg-green-100 text-green-800', icon: Clock },
  completado: { label: 'Completado', color: 'bg-blue-100 text-blue-800', icon: CheckCircle2 },
  pausado: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-800', icon: Pause },
};

interface FormData {
  nombre: string;
  cliente: string;
  direccion: string;
  descripcion: string;
  estado: Proyecto['estado'];
}

const emptyForm: FormData = { nombre: '', cliente: '', direccion: '', descripcion: '', estado: 'activo' };

export default function ProyectosPage() {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingProyecto, setEditingProyecto] = useState<Proyecto | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fetchProyectos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('proyectos')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setProyectos(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProyectos();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserName(user.user_metadata?.full_name || '');
        setUserEmail(user.email || '');
      }
    });
  }, [fetchProyectos]);

  const openCreate = () => {
    setEditingProyecto(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (p: Proyecto) => {
    setEditingProyecto(p);
    setForm({
      nombre: p.nombre,
      cliente: p.cliente || '',
      direccion: p.direccion || '',
      descripcion: p.descripcion || '',
      estado: p.estado,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      setToast({ message: 'El nombre del proyecto es obligatorio', type: 'error' });
      return;
    }
    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      cliente: form.cliente.trim() || null,
      direccion: form.direccion.trim() || null,
      descripcion: form.descripcion.trim() || null,
      estado: form.estado,
    };

    if (editingProyecto) {
      const { error } = await supabase.from('proyectos').update(payload).eq('id', editingProyecto.id);
      if (error) {
        setToast({ message: 'Error al actualizar', type: 'error' });
      } else {
        setToast({ message: 'Proyecto actualizado', type: 'success' });
        setShowModal(false);
        fetchProyectos();
      }
    } else {
      const { error } = await supabase.from('proyectos').insert(payload);
      if (error) {
        setToast({ message: 'Error al crear proyecto', type: 'error' });
      } else {
        setToast({ message: 'Proyecto creado', type: 'success' });
        setShowModal(false);
        fetchProyectos();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (p: Proyecto) => {
    if (!confirm(`¿Eliminar el proyecto "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from('proyectos').delete().eq('id', p.id);
    if (error) {
      setToast({ message: 'Error al eliminar: ' + error.message, type: 'error' });
    } else {
      setToast({ message: 'Proyecto eliminado', type: 'success' });
      fetchProyectos();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <div className="min-h-screen bg-gray-50/80">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Top Bar */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="overflow-hidden rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-200">
              <Image src="/logo.jpg" alt="Logo" width={36} height={36} className="h-8 w-8 object-contain" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[#1a365d] sm:text-lg">Acabados RO</h1>
              <div className="h-0.5 w-12 bg-gradient-to-r from-[#D4A520] to-transparent" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-gray-500">{getGreeting()}</p>
              <p className="text-sm font-medium text-gray-700">{userName || userEmail}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D4A520]/20 text-xs font-bold text-[#D4A520]">
              {(userName || userEmail).charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a365d] to-[#2a4a7f] shadow-sm">
              <Building2 className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Proyectos</h2>
              <p className="text-sm text-gray-500">{proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''} registrado{proyectos.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium">
            <Plus size={18} />
            Nuevo Proyecto
          </button>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <div className="mb-4 h-6 w-3/4 rounded bg-gray-200" />
                <div className="space-y-2">
                  <div className="h-4 w-1/2 rounded bg-gray-200" />
                  <div className="h-4 w-2/3 rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : proyectos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-20 shadow-sm ring-1 ring-gray-100">
            <FolderOpen size={56} className="mb-4 text-gray-300" />
            <p className="mb-2 text-lg font-semibold text-gray-700">No hay proyectos</p>
            <p className="mb-6 text-sm text-gray-500">Crea tu primer proyecto para comenzar</p>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium">
              <Plus size={18} />
              Crear Proyecto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {proyectos.map((proyecto) => {
              const estadoCfg = ESTADO_CONFIG[proyecto.estado];
              return (
                <div
                  key={proyecto.id}
                  className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 transition-all hover:shadow-md hover:ring-gray-200"
                >
                  <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-[#D4A520] via-[#E8B82E] to-[#D4A520]" />

                  <div className="p-5 pl-6">
                    {/* Header */}
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-base font-bold text-[#1a365d]">{proyecto.nombre}</h3>
                        {proyecto.cliente && (
                          <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                            <Users size={13} className="shrink-0" />
                            <span>{proyecto.cliente}</span>
                          </div>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoCfg.color}`}>
                        {estadoCfg.label}
                      </span>
                    </div>

                    {/* Details */}
                    {proyecto.direccion && (
                      <div className="mb-2 flex items-start gap-1.5 text-sm text-gray-500">
                        <MapPin size={13} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-1">{proyecto.direccion}</span>
                      </div>
                    )}
                    {proyecto.descripcion && (
                      <p className="mb-3 line-clamp-2 text-sm text-gray-400">{proyecto.descripcion}</p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                      <button
                        onClick={() => router.push(`/proyecto/${proyecto.id}`)}
                        className="btn-primary flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium"
                      >
                        Abrir
                        <ArrowRight size={14} />
                      </button>
                      <button
                        onClick={() => openEdit(proyecto)}
                        className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-[#1a365d]"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(proyecto)}
                        className="rounded-lg border border-gray-200 p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingProyecto(null); }}
        title={editingProyecto ? 'Editar Proyecto' : 'Nuevo Proyecto'}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nombre del Proyecto *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Hotel TRU, Residencia López..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente</label>
              <input
                type="text"
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                placeholder="Nombre del cliente"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Estado</label>
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as Proyecto['estado'] })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              >
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
                <option value="completado">Completado</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Dirección</label>
            <input
              type="text"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              placeholder="Ubicación del proyecto"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={2}
              placeholder="Detalles del proyecto (opcional)"
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
            <button
              onClick={() => { setShowModal(false); setEditingProyecto(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editingProyecto ? 'Actualizar' : 'Crear Proyecto'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
