'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Plus, Edit2, Trash2, UserCheck, UserX, Eye, Upload, X,
  FileText, Download, HardHat, Search, CheckSquare, Square,
  MessageCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  Empleado, EmpleadoDocumento, TipoDocEmpleado, TIPOS_DOCUMENTO,
} from '@/lib/types';
import { exportToExcel, formatDate } from '@/lib/export-utils';
import Modal from '@/components/Modal';

interface EmpleadoForm {
  nombre_completo: string;
  puesto: string;
  curp: string;
  fecha_alta: string;
}

const emptyForm: EmpleadoForm = {
  nombre_completo: '',
  puesto: '',
  curp: '',
  fecha_alta: new Date().toISOString().split('T')[0],
};

const CURP_REGEX = /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/;
const WHATSAPP_NUMBER = '525611317288';

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

  // Selection for bulk baja
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showBajaModal, setShowBajaModal] = useState(false);
  const [showBulkBajaModal, setShowBulkBajaModal] = useState(false);

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
  const [ocrProcessing, setOcrProcessing] = useState(false);
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

  // --- Selection ---
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const activeFiltered = filteredEmpleados.filter((e) => e.estado === 'activo');
    if (activeFiltered.every((e) => selectedIds.has(e.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeFiltered.map((e) => e.id)));
    }
  };

  const selectedEmpleados = empleados.filter((e) => selectedIds.has(e.id));

  // --- CRUD ---
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
      curp: emp.curp ?? '',
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
    setForm((prev) => ({
      ...prev,
      [name]: name === 'curp' ? value.toUpperCase() : value,
    }));
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
        curp: form.curp.trim() || null,
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

  // --- Bulk Baja + WhatsApp ---
  const handleBulkBaja = async () => {
    if (selectedEmpleados.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('empleados')
        .update({ estado: 'baja', fecha_baja: fechaBaja })
        .in('id', Array.from(selectedIds));
      if (error) throw error;

      const nombres = selectedEmpleados.map((e, i) => `${i + 1}. ${e.nombre_completo} - ${e.puesto}`).join('\n');
      const mensaje = `Solicito dar de baja a los siguientes trabajadores:\n\n${nombres}\n\nFecha de baja: ${fechaBaja}`;
      const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
      window.open(waUrl, '_blank');

      showToast(`${selectedEmpleados.length} empleado(s) dado(s) de baja`, 'success');
      setShowBulkBajaModal(false);
      setSelectedIds(new Set());
      fetchEmpleados();
    } catch (err) {
      console.error('Error bulk baja:', err);
      showToast('Error al procesar las bajas', 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Excel Export ---
  const handleExport = () => {
    if (filteredEmpleados.length === 0) {
      showToast('No hay empleados para exportar', 'error');
      return;
    }

    const headers = [
      { key: 'nombre', label: 'Nombre Completo' },
      { key: 'puesto', label: 'Puesto' },
      { key: 'curp', label: 'CURP' },
      { key: 'estado', label: 'Estado' },
      { key: 'fecha_alta', label: 'Fecha de Alta' },
      { key: 'fecha_baja', label: 'Fecha de Baja' },
    ];

    const data = filteredEmpleados.map((e) => ({
      nombre: e.nombre_completo,
      puesto: e.puesto,
      curp: e.curp ?? '',
      estado: e.estado === 'activo' ? 'Activo' : 'Baja',
      fecha_alta: formatDate(e.fecha_alta),
      fecha_baja: e.fecha_baja ? formatDate(e.fecha_baja) : '',
    }));

    exportToExcel(data, headers, 'Empleados_Acabados_RO', 'Empleados', 'Acabados RO — Lista de Empleados');
    showToast('Excel exportado correctamente', 'success');
  };

  // --- Document handlers ---
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

  const extractCurpFromImage = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) return null;
    try {
      setOcrProcessing(true);
      showToast('Leyendo CURP de la imagen...', 'success');
      const Tesseract = await import('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(file, 'spa');
      const cleaned = text.replace(/\s/g, '').toUpperCase();
      const match = cleaned.match(CURP_REGEX);
      return match ? match[0] : null;
    } catch (err) {
      console.error('OCR error:', err);
      return null;
    } finally {
      setOcrProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEmpleado) return;

    const maxSize = 10 * 1024 * 1024;
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

      // OCR for CURP documents
      if (uploadTipo === 'curp' && file.type.startsWith('image/')) {
        const curpDetected = await extractCurpFromImage(file);
        if (curpDetected) {
          await supabase
            .from('empleados')
            .update({ curp: curpDetected })
            .eq('id', selectedEmpleado.id);
          setSelectedEmpleado({ ...selectedEmpleado, curp: curpDetected });
          showToast(`CURP detectado: ${curpDetected}`, 'success');
          fetchEmpleados();
        } else {
          showToast('CURP subido. No se pudo leer automáticamente — ingrésalo manualmente.', 'error');
        }
      } else {
        showToast(`${TIPOS_DOCUMENTO[uploadTipo]} subido correctamente`, 'success');
      }

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
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1a365d] px-4 py-2.5 text-sm font-medium text-[#1a365d] transition-colors hover:bg-[#1a365d]/5"
          >
            <Download size={16} />
            Exportar Excel
          </button>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
          >
            <Plus size={16} />
            Alta de Empleado
          </button>
        </div>
      </div>

      {/* Stats */}
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

      {/* Bulk Baja Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[#8B1A1A]/20 bg-[#8B1A1A]/5 px-4 py-3">
          <p className="text-sm font-medium text-[#8B1A1A]">
            {selectedIds.size} empleado{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Deseleccionar
            </button>
            <button
              onClick={() => {
                setFechaBaja(new Date().toISOString().split('T')[0]);
                setShowBulkBajaModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#8B1A1A] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#A52222]"
            >
              <MessageCircle size={14} />
              Dar de Baja y Notificar por WhatsApp
            </button>
          </div>
        </div>
      )}

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
              <div className="mb-2 flex items-start gap-3">
                {emp.estado === 'activo' && (
                  <button onClick={() => toggleSelect(emp.id)} className="mt-0.5 shrink-0">
                    {selectedIds.has(emp.id) ? (
                      <CheckSquare size={18} className="text-[#8B1A1A]" />
                    ) : (
                      <Square size={18} className="text-gray-300" />
                    )}
                  </button>
                )}
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{emp.nombre_completo}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{emp.puesto}</p>
                  {emp.curp && <p className="mt-0.5 font-mono text-xs text-gray-400">{emp.curp}</p>}
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
                <th className="px-3 py-3 text-center">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-600">
                    {filteredEmpleados.filter((e) => e.estado === 'activo').length > 0 &&
                     filteredEmpleados.filter((e) => e.estado === 'activo').every((e) => selectedIds.has(e.id)) ? (
                      <CheckSquare size={16} className="text-[#8B1A1A]" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600">Nombre Completo</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Puesto</th>
                <th className="px-4 py-3 font-semibold text-gray-600">CURP</th>
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
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <span className="inline-block h-4 w-full max-w-[120px] animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredEmpleados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No se encontraron empleados.
                  </td>
                </tr>
              ) : (
                filteredEmpleados.map((emp) => (
                  <tr key={emp.id} className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                    selectedIds.has(emp.id) ? 'bg-red-50/30' : ''
                  }`}>
                    <td className="px-3 py-3 text-center">
                      {emp.estado === 'activo' ? (
                        <button onClick={() => toggleSelect(emp.id)}>
                          {selectedIds.has(emp.id) ? (
                            <CheckSquare size={16} className="text-[#8B1A1A]" />
                          ) : (
                            <Square size={16} className="text-gray-300 hover:text-gray-500" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-block w-4" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                          emp.estado === 'activo' ? 'bg-[#16a34a]' : 'bg-gray-400'
                        }`}>
                          {emp.nombre_completo.charAt(0).toUpperCase()}
                        </div>
                        {emp.nombre_completo}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.puesto}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">
                      {emp.curp || <span className="text-gray-300">—</span>}
                    </td>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              CURP
            </label>
            <input
              type="text"
              name="curp"
              value={form.curp}
              onChange={handleFormChange}
              placeholder="Se llena automáticamente al subir foto del CURP"
              maxLength={18}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase text-gray-700 placeholder-gray-400 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
            <p className="mt-1 text-xs text-gray-400">
              Se detecta automáticamente al subir la foto del CURP en documentos, o puedes ingresarlo manualmente.
            </p>
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

      {/* Single Baja Modal */}
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
            <input type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]" />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => { setShowBajaModal(false); setBajaEmpleado(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleBaja} disabled={saving}
              className="rounded-lg bg-[#8B1A1A] px-4 py-2 text-sm font-medium text-white hover:bg-[#A52222] disabled:opacity-50">
              {saving ? 'Procesando...' : 'Confirmar Baja'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk Baja + WhatsApp Modal */}
      <Modal
        isOpen={showBulkBajaModal}
        onClose={() => setShowBulkBajaModal(false)}
        title="Dar de Baja Masiva"
        size="lg"
      >
        <div>
          <p className="text-sm text-gray-600">
            Se dará de baja a los siguientes <span className="font-bold text-[#8B1A1A]">{selectedEmpleados.length}</span> trabajadores
            y se enviará notificación por WhatsApp:
          </p>
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-3">
            {selectedEmpleados.map((emp, i) => (
              <div key={emp.id} className="flex items-center gap-2 border-b border-gray-100 py-1.5 last:border-0">
                <span className="text-xs font-bold text-gray-400">{i + 1}.</span>
                <span className="text-sm font-medium text-gray-900">{emp.nombre_completo}</span>
                <span className="text-xs text-gray-500">— {emp.puesto}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Fecha de Baja</label>
            <input type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]" />
          </div>
          <div className="mt-4 rounded-lg bg-green-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-green-800">
              <MessageCircle size={14} />
              Se abrirá WhatsApp con el mensaje de baja al número 56 1131 7288
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setShowBulkBajaModal(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleBulkBaja} disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#8B1A1A] px-4 py-2 text-sm font-medium text-white hover:bg-[#A52222] disabled:opacity-50">
              <MessageCircle size={16} />
              {saving ? 'Procesando...' : 'Confirmar Bajas y Enviar WhatsApp'}
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
            <button onClick={() => { setShowDeleteModal(false); setDeletingEmpleado(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
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
            {selectedEmpleado?.curp && (
              <p className="mt-0.5 font-mono text-xs text-gray-500">
                CURP: {selectedEmpleado.curp}
              </p>
            )}
            <p className="mt-0.5 text-xs text-gray-500">
              Alta: {selectedEmpleado ? formatDate(selectedEmpleado.fecha_alta) : ''}
              {selectedEmpleado?.fecha_baja && ` — Baja: ${formatDate(selectedEmpleado.fecha_baja)}`}
            </p>
          </div>

          {ocrProcessing && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <svg className="h-4 w-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs font-medium text-blue-700">Leyendo CURP de la imagen...</span>
            </div>
          )}

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
                        {tipo === 'curp' && (
                          <span className="ml-2 text-xs font-normal text-blue-500">
                            (sube foto para leer automáticamente)
                          </span>
                        )}
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
                          <div key={doc.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
                            <FileText size={14} className="shrink-0 text-[#1a365d]" />
                            <span className="flex-1 truncate text-xs text-gray-700">{doc.nombre_archivo}</span>
                            <button onClick={() => handleViewDoc(doc)} className="rounded p-1 text-gray-400 hover:text-blue-600" title="Ver">
                              <Eye size={14} />
                            </button>
                            <button onClick={() => handleDownloadDoc(doc)} className="rounded p-1 text-gray-400 hover:text-green-600" title="Descargar">
                              <Download size={14} />
                            </button>
                            <button onClick={() => handleDeleteDoc(doc)} className="rounded p-1 text-gray-400 hover:text-red-600" title="Eliminar">
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
