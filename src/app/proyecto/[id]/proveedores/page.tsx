'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Proveedor } from '@/lib/types';
import Modal from '@/components/Modal';
import Toast from '@/components/Toast';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Truck,
  Phone,
  Mail,
  MapPin,
  User,
  FileText,
} from 'lucide-react';

interface FormData {
  nombre: string;
  rfc: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
}

const emptyForm: FormData = {
  nombre: '',
  rfc: '',
  contacto: '',
  telefono: '',
  email: '',
  direccion: '',
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | null>(null);
  const [deletingProveedor, setDeletingProveedor] = useState<Proveedor | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const fetchProveedores = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setProveedores(data || []);
    } catch (err) {
      console.error('Error fetching proveedores:', err);
      setToast({ message: 'Error al cargar proveedores', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const filteredProveedores = proveedores.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const openAddModal = () => {
    setEditingProveedor(null);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (proveedor: Proveedor) => {
    setEditingProveedor(proveedor);
    setFormData({
      nombre: proveedor.nombre,
      rfc: proveedor.rfc || '',
      contacto: proveedor.contacto || '',
      telefono: proveedor.telefono || '',
      email: proveedor.email || '',
      direccion: proveedor.direccion || '',
    });
    setShowModal(true);
  };

  const openDeleteModal = (proveedor: Proveedor) => {
    setDeletingProveedor(proveedor);
    setShowDeleteModal(true);
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) {
      setToast({ message: 'El nombre es obligatorio', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        rfc: formData.rfc.trim() || null,
        contacto: formData.contacto.trim() || null,
        telefono: formData.telefono.trim() || null,
        email: formData.email.trim() || null,
        direccion: formData.direccion.trim() || null,
      };

      if (editingProveedor) {
        const { error } = await supabase
          .from('proveedores')
          .update(payload)
          .eq('id', editingProveedor.id);
        if (error) throw error;
        setToast({ message: 'Proveedor actualizado correctamente', type: 'success' });
      } else {
        const { error } = await supabase
          .from('proveedores')
          .insert(payload);
        if (error) throw error;
        setToast({ message: 'Proveedor agregado correctamente', type: 'success' });
      }

      setShowModal(false);
      setFormData(emptyForm);
      setEditingProveedor(null);
      await fetchProveedores();
    } catch (err) {
      console.error('Error saving proveedor:', err);
      setToast({ message: 'Error al guardar proveedor', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingProveedor) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('proveedores')
        .delete()
        .eq('id', deletingProveedor.id);
      if (error) throw error;

      setToast({ message: 'Proveedor eliminado correctamente', type: 'success' });
      setShowDeleteModal(false);
      setDeletingProveedor(null);
      await fetchProveedores();
    } catch (err) {
      console.error('Error deleting proveedor:', err);
      setToast({ message: 'Error al eliminar proveedor', type: 'error' });
    } finally {
      setSaving(false);
    }
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
            <Truck size={24} className="text-[#1a365d]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
            <p className="text-sm text-gray-500">
              {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''} registrado{proveedores.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
        >
          <Plus size={18} />
          Agregar Proveedor
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
          placeholder="Buscar proveedor por nombre..."
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
                <div className="h-4 w-1/2 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProveedores.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 shadow-sm ring-1 ring-gray-100">
          <Truck size={48} className="mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">
            {search
              ? 'No se encontraron proveedores con ese nombre'
              : 'No hay proveedores registrados'}
          </p>
          {!search && (
            <button
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
            >
              <Plus size={16} />
              Agregar primer proveedor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProveedores.map((proveedor) => (
            <div
              key={proveedor.id}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex items-start justify-between">
                <h3 className="text-base font-bold text-[#1a365d]">
                  {proveedor.nombre}
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(proveedor)}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-[#1a365d]/10 hover:text-[#1a365d]"
                    title="Editar"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => openDeleteModal(proveedor)}
                    className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 text-sm text-gray-600">
                {proveedor.rfc && (
                  <div className="flex items-center gap-2.5">
                    <FileText size={15} className="shrink-0 text-gray-400" />
                    <span className="font-mono text-xs">{proveedor.rfc}</span>
                  </div>
                )}
                {proveedor.contacto && (
                  <div className="flex items-center gap-2.5">
                    <User size={15} className="shrink-0 text-gray-400" />
                    <span>{proveedor.contacto}</span>
                  </div>
                )}
                {proveedor.telefono && (
                  <div className="flex items-center gap-2.5">
                    <Phone size={15} className="shrink-0 text-gray-400" />
                    <span>{proveedor.telefono}</span>
                  </div>
                )}
                {proveedor.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail size={15} className="shrink-0 text-gray-400" />
                    <span className="truncate">{proveedor.email}</span>
                  </div>
                )}
                {proveedor.direccion && (
                  <div className="flex items-start gap-2.5">
                    <MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" />
                    <span>{proveedor.direccion}</span>
                  </div>
                )}
                {!proveedor.rfc &&
                  !proveedor.contacto &&
                  !proveedor.telefono &&
                  !proveedor.email &&
                  !proveedor.direccion && (
                    <p className="italic text-gray-400">Sin datos de contacto</p>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingProveedor(null);
          setFormData(emptyForm);
        }}
        title={editingProveedor ? 'Editar Proveedor' : 'Agregar Proveedor'}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) =>
                setFormData({ ...formData, nombre: e.target.value })
              }
              placeholder="Nombre del proveedor"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              RFC
            </label>
            <input
              type="text"
              value={formData.rfc}
              onChange={(e) =>
                setFormData({ ...formData, rfc: e.target.value.toUpperCase() })
              }
              placeholder="XAXX010101000"
              maxLength={13}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 uppercase focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Contacto
            </label>
            <input
              type="text"
              value={formData.contacto}
              onChange={(e) =>
                setFormData({ ...formData, contacto: e.target.value })
              }
              placeholder="Nombre de la persona de contacto"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Telefono
              </label>
              <input
                type="tel"
                value={formData.telefono}
                onChange={(e) =>
                  setFormData({ ...formData, telefono: e.target.value })
                }
                placeholder="(000) 000-0000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Email
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
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Direccion
            </label>
            <textarea
              value={formData.direccion}
              onChange={(e) =>
                setFormData({ ...formData, direccion: e.target.value })
              }
              placeholder="Direccion del proveedor"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              onClick={() => {
                setShowModal(false);
                setEditingProveedor(null);
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
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletingProveedor(null);
        }}
        title="Eliminar Proveedor"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600">
            ¿Estas seguro de que deseas eliminar al proveedor{' '}
            <span className="font-semibold text-gray-900">
              {deletingProveedor?.nombre}
            </span>
            ? Esta accion no se puede deshacer.
          </p>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingProveedor(null);
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
