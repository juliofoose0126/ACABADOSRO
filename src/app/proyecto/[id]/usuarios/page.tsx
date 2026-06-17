'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/Modal';
import Toast from '@/components/Toast';
import {
  Plus,
  Trash2,
  Search,
  Users,
  Mail,
  Shield,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'usuario';
  activo: boolean;
  created_at: string;
}

interface FormData {
  nombre: string;
  email: string;
  password: string;
  rol: 'admin' | 'usuario';
}

const emptyForm: FormData = {
  nombre: '',
  email: '',
  password: '',
  rol: 'usuario',
};

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-users`;

async function apiCall(path: string, method: string, body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No autenticado');

  const res = await fetch(`${FUNCTION_URL}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en la operacion');
  return data;
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const fetchUsuarios = useCallback(async () => {
    try {
      const data = await apiCall('list', 'GET');
      setUsuarios(data);
    } catch (err) {
      console.error('Error fetching usuarios:', err);
      setToast({ message: 'Error al cargar usuarios', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
      fetchUsuarios();
    };
    init();
  }, [fetchUsuarios]);

  const filteredUsuarios = usuarios.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const openAddModal = () => {
    setFormData(emptyForm);
    setShowPassword(false);
    setShowModal(true);
  };

  const openDeleteModal = (user: UserItem) => {
    setDeletingUser(user);
    setShowDeleteModal(true);
  };

  const handleSave = async () => {
    if (!formData.email.trim() || !formData.password.trim()) {
      setToast({ message: 'Email y contrasena son obligatorios', type: 'error' });
      return;
    }
    if (formData.password.length < 6) {
      setToast({ message: 'La contrasena debe tener al menos 6 caracteres', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      await apiCall('create', 'POST', {
        email: formData.email.trim(),
        password: formData.password,
        nombre: formData.nombre.trim(),
        rol: formData.rol,
      });

      setToast({ message: 'Usuario creado correctamente', type: 'success' });
      setShowModal(false);
      setFormData(emptyForm);
      await fetchUsuarios();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear usuario';
      setToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;

    setSaving(true);
    try {
      await apiCall('delete', 'DELETE', { user_id: deletingUser.id });
      setToast({ message: 'Usuario eliminado correctamente', type: 'success' });
      setShowDeleteModal(false);
      setDeletingUser(null);
      await fetchUsuarios();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar usuario';
      setToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="pt-10 md:pt-0">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[#1a365d]/10 p-2.5">
            <Users size={24} className="text-[#1a365d]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
            <p className="text-sm text-gray-500">
              {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado{usuarios.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
        >
          <Plus size={18} />
          Agregar Usuario
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="Buscar usuario por nombre o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
            >
              <div className="mb-4 h-5 w-3/4 rounded bg-gray-200" />
              <div className="space-y-3">
                <div className="h-4 w-1/2 rounded bg-gray-200" />
                <div className="h-4 w-2/3 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredUsuarios.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 shadow-sm ring-1 ring-gray-100">
          <Users size={48} className="mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">
            {search
              ? 'No se encontraron usuarios'
              : 'No hay usuarios registrados'}
          </p>
          {!search && (
            <button
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
            >
              <Plus size={16} />
              Agregar primer usuario
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredUsuarios.map((usuario) => (
            <div
              key={usuario.id}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                      usuario.rol === 'admin' ? 'bg-[#1a365d]' : 'bg-gray-400'
                    }`}
                  >
                    {(usuario.nombre || usuario.email).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#1a365d]">
                      {usuario.nombre || 'Sin nombre'}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        usuario.rol === 'admin'
                          ? 'bg-[#1a365d]/10 text-[#1a365d]'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {usuario.rol === 'admin' ? (
                        <ShieldCheck size={12} />
                      ) : (
                        <Shield size={12} />
                      )}
                      {usuario.rol === 'admin' ? 'Administrador' : 'Usuario'}
                    </span>
                  </div>
                </div>
                {usuario.id !== currentUserId && (
                  <button
                    onClick={() => openDeleteModal(usuario)}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <div className="space-y-2.5 text-sm text-gray-600">
                <div className="flex items-center gap-2.5">
                  <Mail size={15} className="shrink-0 text-gray-400" />
                  <span className="truncate">{usuario.email}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Creado: {formatDate(usuario.created_at)}</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                      usuario.activo
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setFormData(emptyForm);
        }}
        title="Agregar Usuario"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Nombre
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) =>
                setFormData({ ...formData, nombre: e.target.value })
              }
              placeholder="Nombre completo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="correo@ejemplo.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Contrasena <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="Minimo 6 caracteres"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Rol
            </label>
            <select
              value={formData.rol}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  rol: e.target.value as 'admin' | 'usuario',
                })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              <option value="usuario">Usuario</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              onClick={() => {
                setShowModal(false);
                setFormData(emptyForm);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f] disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Crear Usuario'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletingUser(null);
        }}
        title="Eliminar Usuario"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600">
            ¿Estas seguro de que deseas eliminar al usuario{' '}
            <span className="font-semibold text-gray-900">
              {deletingUser?.email}
            </span>
            ? Esta accion no se puede deshacer y el usuario ya no podra acceder
            a la aplicacion.
          </p>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingUser(null);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
