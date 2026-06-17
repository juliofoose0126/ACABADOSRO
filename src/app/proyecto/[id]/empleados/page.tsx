'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Plus, Edit2, Trash2, UserCheck, UserX, Eye, Upload, X,
  FileText, Download, HardHat, Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  Empleado, EmpleadoDocumento, TipoDocEmpleado, TIPOS_DOCUMENTO,
} from '@/lib/types';
import { formatDate } from '@/lib/export-utils';
import Modal from '@/components/Modal';

interface EmpleadoForm {
  nombre_completo: string;
  puesto: string;
  fecha_alta: string;
}

const emptyForm: EmpleadoForm = {
  nombre_completo: '',
  puesto: '',
  fecha_alta: new Date().toISOString().split('T')[0],
};

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

export default function EmpleadosPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState<'todos' | 'activo' | 'baja'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showBajaModal, setShowBajaModal] = useState(false);

  const [editingEmpleado, setEditingEmpleado] = useState<Empleado | null>(null);
  const [deletingEmpleado, setDeletingEmpleado] = useState<Empleado | null>(null);
  const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
  const [bajaEmpleado, setBajaEmpleado] = useState<Empleado | null>(null);
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0]);

  const [form, setForm] = useState<EmpleadoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Documents
  const [documentos, setDocumentos] = useState<EmpleadoDocumento[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState<TipoDocEmpleado | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTipo, setUploadTipo] = useState<TipoDocEmpleado>('constancia_fiscal');

  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastIdCounter = 0;

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now() + (toastIdCounter++);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const fetchEmpleados = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('empleados')
        .select('*')
        .eq('proyecto_id', projectId)
        .order('nombre_completo', { ascending: true });

      if (filterEstado !== 'todos') {
        query = query.eq('estado', filterEstado);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEmpleados(data ?? []);
    } catch (err) {
      console.error('Error fetching empleados:', err);
      showToast('Error al cargar los empleados', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterEstado, showToast, projectId]);

  useEffect(() => {
    fetchEmpleados();
  }, [fetchEmpleados]);

  const filteredEmpleados = empleados.filter((e) =>
    e.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.puesto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // CRUD handlers
  const openAddModal = () => {
    setEditingEmpleado(null);
    setForm(emptyForm);
    setShowFormModal(true);
  };

  const openEditModal = (emp: Empleado) => {
    setEditingEmpleado(emp);
    setForm({
      nombre_completo: emp.nombre_completo,
      puesto: emp.puesto,
      fecha_alta: emp.fecha_alta,
    });
    setShowFormModal(true);
  };

  const openDeleteModal = (emp: Empleado) => {
    setDeletingEmpleado(emp);
    setShowDeleteModal(true);
  };

  const openBajaModal = (emp: Empleado) => {
    setBajaEmpleado(emp);
    setFechaBaja(new Date().toISOString().split('T')[0]);
    setShowBajaModal(true);
  };

  const openDocsModal = async (emp: Empleado) => {
    setSelectedEmpleado(emp);
    setShowDocsModal(true);
    await fetchDocumentos(emp.id);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.nombre_completo.trim() || !form.puesto.trim() || !form.fecha_alta) {
      showToast('Completa todos los campos obligatorios', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nombre_completo: form.nombre_completo.trim(),
        puesto: form.puesto.trim(),
        fecha_alta: form.fecha_alta,
        proyecto_id: projectId,
      };

      if (editingEmpleado) {
        const { error } = await supabase
          .from('empleados')
          .update(payload)
          .eq('id', editingEmpleado.id);
        if (error) throw error;
        showToast('Empleado actualizado correctamente', 'success');
      } else {
        const { error } = await supabase.from('empleados').insert(payload);
        if (error) throw error;
        showToast('Empleado dado de alta correctamente', 'success');
      }

      setShowFormModal(false);
      setEditingEmpleado(null);
      setForm(emptyForm);
      fetchEmpleados();
    } catch (err) {
      console.error('Error saving empleado:', err);
      showToast('Error al guardar el empleado', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBaja = async () => {
    if (!bajaEmpleado) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('empleados')
        .update({ estado: 'baja', fecha_baja: fechaBaja })
        .eq('id', bajaEmpleado.id);
      if (error) throw error;
      showToast('Empleado dado de baja correctamente', 'success');
      setShowBajaModal(false);
      setBajaEmpleado(null);
      fetchEmpleados();
    } catch (err) {
      console.error('Error:', err);
      showToast('Error al dar de baja', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivar = async (emp: Empleado) => {
    try {
      const { error } = await supabase
        .from('empleados')
        .update({ estado: 'activo', fecha_baja: null })
        .eq('id', emp.id);
      if (error) throw error;
      showToast('Empleado reactivado correctamente', 'success');
      fetchEmpleados();
    } catch (err) {
      console.error('Error:', err);
      showToast('Error al reactivar', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deletingEmpleado) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('empleados').delete().eq('id', deletingEmpleado.id);
      if (error) throw error;
      showToast('Empleado eliminado correctamente', 'success');
      setShowDeleteModal(false);
      setDeletingEmpleado(null);
      fetchEmpleados();
    } catch (err) {
      console.error('Error deleting:', err);
      showToast('Error al eliminar el empleado', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Document handlers
  const fetchDocumentos = async (empleadoId: string) => {
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('empleado_documentos')
        .select('*')
        .eq('empleado_id', empleadoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocumentos(data ?? []);
    } catch (err) {
      console.error('Error fetching docs:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleUploadClick = (tipo: TipoDocEmpleado) => {
    setUploadTipo(tipo);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEmpleado) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      showToast('El archivo no debe superar 10MB', 'error');
      return;
    }

    setUploading(uploadTipo);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const storagePath = `${selectedEmpleado.id}/${uploadTipo}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('empleados-docs')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('empleado_documentos')
        .insert({
          empleado_id: selectedEmpleado.id,
          tipo: uploadTipo,
          nombre_archivo: file.name,
          storage_path: storagePath,
        });

      if (dbError) throw dbError;

      showToast(`${TIPOS_DOCUMENTO[uploadTipo]} subido correctamente`, 'success');
      await fetchDocumentos(selectedEmpleado.id);
    } catch (err) {
      console.error('Error uploading:', err);
      showToast('Error al subir el archivo', 'error');
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleViewDoc = async (doc: EmpleadoDocumento) => {
    try {
      const { data, error } = await supabase.storage
        .from('empleados-docs')
        .createSignedUrl(doc.storage_path, 300);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error('Error getting URL:', err);
      showToast('Error al abrir el archivo', 'error');
    }
  };

  const handleDownloadDoc = async (doc: EmpleadoDocumento) => {
    try {
      const { data, error } = await supabase.storage
        .from('empleados-docs')
        .download(doc.storage_path);

      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nombre_archivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading:', err);
      showToast('Error al descargar el archivo', 'error');
    }
  };

  const handleDeleteDoc = async (doc: EmpleadoDocumento) => {
    try {
      await supabase.storage.from('empleados-docs').remove([doc.storage_path]);
      const { error } = await supabase.from('empleado_documentos').delete().eq('id', doc.id);
      if (error) throw error;
      showToast('Documento eliminado', 'success');
      if (selectedEmpleado) await fetchDocumentos(selectedEmpleado.id);
    } catch (err) {
      console.error('Error deleting doc:', err);
      showToast('Error al eliminar el documento', 'error');
    }
  };

  const getDocForTipo = (tipo: TipoDocEmpleado) =>
    documentos.filter((d) => d.tipo === tipo);

  const activosCount = empleados.filter((e) => e.estado === 'activo').length;
  const bajasCount = empleados.filter((e) => e.estado === 'baja').length;

  return (
    <div className="pt-10 md:pt-0">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx"
        onChange={handleFileChange}
      />

      {/* Toasts */}
      <div className="fixed right-4 top-4 z-[200] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-slide-in rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
          <p className="mt-1 text-sm text-gray-500">
            Altas, bajas y documentación de trabajadores
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
        >
          <Plus size={16} />
          Alta de Empleado
        </button>
      </div>

      {/* Stats + Filters */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border-l-4 border-l-[#16a34a] bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-xs font-medium text-gray-500">Activos</p>
          <p className="mt-1 text-2xl font-bold text-[#16a34a]">{activosCount}</p>
        </div>
        <div className="rounded-xl border-l-4 border-l-[#8B1A1A] bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-xs font-medium text-gray-500">Bajas</p>
          <p className="mt-1 text-2xl font-bold text-[#8B1A1A]">{bajasCount}</p>
        </div>
        <div className="rounded-xl border-l-4 border-l-[#1a365d] bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <p className="text-xs font-medium text-gray-500">Total</p>
          <p className="mt-1 text-2xl font-bold text-[#1a365d]">{empleados.length}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              <Search size={12} className="mr-1 inline" />
              Buscar
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nombre o puesto..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Estado</label>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as 'todos' | 'activo' | 'baja')}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              <option value="todos">Todos</option>
              <option value="activo">Activos</option>
              <option value="baja">Bajas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-200" />
            </div>
          ))
        ) : filteredEmpleados.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl bg-white py-12 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
            No se encontraron empleados.
          </div>
        ) : (
          filteredEmpleados.map((emp) => (
            <div
              key={emp.id}
              className={`rounded-xl border-l-4 ${
                emp.estado === 'activo' ? 'border-l-[#16a34a]' : 'border-l-[#8B1A1A]'
              } bg-white p-4 shadow-sm ring-1 ring-gray-100`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{emp.nombre_completo}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{emp.puesto}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      emp.estado === 'activo'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {emp.estado === 'activo' ? 'Activo' : 'Baja'}
                    </span>
                    <span className="text-xs text-gray-400">Alta: {formatDate(emp.fecha_alta)}</span>
                  </div>
                  {emp.fecha_baja && (
                    <p className="mt-0.5 text-xs text-red-400">Baja: {formatDate(emp.fecha_baja)}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1 border-t border-gray-100 pt-2">
                <button onClick={() => openDocsModal(emp)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#1a365d] active:bg-gray-100">
                  Documentos
                </button>
                <button onClick={() => openEditModal(emp)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#1a365d] active:bg-gray-100">
                  Editar
                </button>
                {emp.estado === 'activo' ? (
                  <button onClick={() => openBajaModal(emp)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#8B1A1A] active:bg-red-50">
                    Dar Baja
                  </button>
                ) : (
                  <button onClick={() => handleReactivar(emp)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#16a34a] active:bg-green-50">
                    Reactivar
                  </button>
                )}
                <button onClick={() => openDeleteModal(emp)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 active:bg-red-50">
                  Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 font-semibold text-gray-600">Nombre Completo</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Puesto</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Estado</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Fecha Alta</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Fecha Baja</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <span className="inline-block h-4 w-full max-w-[120px] animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredEmpleados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    No se encontraron empleados.
                  </td>
                </tr>
              ) : (
                filteredEmpleados.map((emp) => (
                  <tr key={emp.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${
                          emp.estado === 'activo' ? 'bg-[#16a34a]' : 'bg-gray-400'
                        }`}>
                          {emp.nombre_completo.charAt(0).toUpperCase()}
                        </div>
                        {emp.nombre_completo}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.puesto}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        emp.estado === 'activo'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {emp.estado === 'activo' ? 'Activo' : 'Baja'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(emp.fecha_alta)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {emp.fecha_baja ? formatDate(emp.fecha_baja) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openDocsModal(emp)} className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600" title="Documentos">
                          <FileText size={16} />
                        </button>
                        <button onClick={() => openEditModal(emp)} className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-yellow-50 hover:text-yellow-600" title="Editar">
                          <Edit2 size={16} />
                        </button>
                        {emp.estado === 'activo' ? (
                          <button onClick={() => openBajaModal(emp)} className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Dar de Baja">
                            <UserX size={16} />
                          </button>
                        ) : (
                          <button onClick={() => handleReactivar(emp)} className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600" title="Reactivar">
                            <UserCheck size={16} />
                          </button>
                        )}
                        <button onClick={() => openDeleteModal(emp)} className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Employee Modal */}
      <Modal
        isOpen={showFormModal}
        onClose={() => { setShowFormModal(false); setEditingEmpleado(null); setForm(emptyForm); }}
        title={editingEmpleado ? 'Editar Empleado' : 'Alta de Empleado'}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nombre_completo"
              value={form.nombre_completo}
              onChange={handleFormChange}
              placeholder="Nombre completo del trabajador"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Puesto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="puesto"
              value={form.puesto}
              onChange={handleFormChange}
              placeholder="Puesto o cargo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Fecha de Alta <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="fecha_alta"
              value={form.fecha_alta}
              onChange={handleFormChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              onClick={() => { setShowFormModal(false); setEditingEmpleado(null); setForm(emptyForm); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f] disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editingEmpleado ? 'Actualizar' : 'Dar de Alta'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Baja Modal */}
      <Modal
        isOpen={showBajaModal}
        onClose={() => { setShowBajaModal(false); setBajaEmpleado(null); }}
        title="Dar de Baja"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600">
            ¿Dar de baja a <span className="font-semibold text-gray-900">{bajaEmpleado?.nombre_completo}</span>?
          </p>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Fecha de Baja</label>
            <input
              type="date"
              value={fechaBaja}
              onChange={(e) => setFechaBaja(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => { setShowBajaModal(false); setBajaEmpleado(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleBaja}
              disabled={saving}
              className="rounded-lg bg-[#8B1A1A] px-4 py-2 text-sm font-medium text-white hover:bg-[#A52222] disabled:opacity-50"
            >
              {saving ? 'Procesando...' : 'Confirmar Baja'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeletingEmpleado(null); }}
        title="Eliminar Empleado"
        size="sm"
      >
        <div>
          <p className="text-sm text-gray-600">
            ¿Eliminar permanentemente a <span className="font-semibold text-gray-900">{deletingEmpleado?.nombre_completo}</span>?
            Se eliminarán también todos sus documentos. Esta acción no se puede deshacer.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => { setShowDeleteModal(false); setDeletingEmpleado(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Documents Modal */}
      <Modal
        isOpen={showDocsModal}
        onClose={() => { setShowDocsModal(false); setSelectedEmpleado(null); setDocumentos([]); }}
        title={`Documentos — ${selectedEmpleado?.nombre_completo ?? ''}`}
        size="xl"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-sm font-medium text-gray-700">
              <HardHat size={14} className="mr-1 inline text-[#1a365d]" />
              {selectedEmpleado?.puesto}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Alta: {selectedEmpleado ? formatDate(selectedEmpleado.fecha_alta) : ''}
              {selectedEmpleado?.fecha_baja && ` — Baja: ${formatDate(selectedEmpleado.fecha_baja)}`}
            </p>
          </div>

          {loadingDocs ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(Object.keys(TIPOS_DOCUMENTO) as TipoDocEmpleado[]).map((tipo) => {
                const docs = getDocForTipo(tipo);
                const isUploading = uploading === tipo;

                return (
                  <div key={tipo} className="rounded-lg border border-gray-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-800">
                        {TIPOS_DOCUMENTO[tipo]}
                      </h4>
                      <button
                        onClick={() => handleUploadClick(tipo)}
                        disabled={isUploading}
                        className="inline-flex items-center gap-1 rounded-md bg-[#1a365d] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#2a4a7f] disabled:opacity-50"
                      >
                        {isUploading ? (
                          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <Upload size={12} />
                        )}
                        Subir
                      </button>
                    </div>

                    {docs.length === 0 ? (
                      <p className="text-xs text-gray-400">Sin documento</p>
                    ) : (
                      <div className="space-y-1.5">
                        {docs.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2"
                          >
                            <FileText size={14} className="shrink-0 text-[#1a365d]" />
                            <span className="flex-1 truncate text-xs text-gray-700">
                              {doc.nombre_archivo}
                            </span>
                            <button
                              onClick={() => handleViewDoc(doc)}
                              className="rounded p-1 text-gray-400 transition-colors hover:text-blue-600"
                              title="Ver"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => handleDownloadDoc(doc)}
                              className="rounded p-1 text-gray-400 transition-colors hover:text-green-600"
                              title="Descargar"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteDoc(doc)}
                              className="rounded p-1 text-gray-400 transition-colors hover:text-red-600"
                              title="Eliminar"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
