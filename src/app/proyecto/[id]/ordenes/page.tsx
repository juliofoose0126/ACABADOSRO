'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OrdenCompra, OrdenDetalle, Material, Proveedor } from '@/lib/types';
import { exportOCExcel, exportOCPDF, formatCurrency, formatDate, formatDateShort, type OCExportData } from '@/lib/export-utils';
import Modal from '@/components/Modal';
import {
  Plus,
  Eye,
  Edit2,
  FileText,
  FileSpreadsheet,
  Trash2,
  ShoppingCart,
  X,
  Search,
  Check,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DetalleItem {
  material_id: string | null;
  codigo_item: string;
  descripcion_item: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal: number;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

type EstadoFilter = 'todos' | OrdenCompra['estado'];

const ESTADO_COLORS: Record<OrdenCompra['estado'], string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobada: 'bg-green-100 text-green-800',
  recibida: 'bg-blue-100 text-blue-800',
  cancelada: 'bg-red-100 text-red-800',
};

const ESTADO_LABELS: Record<OrdenCompra['estado'], string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
};

const ESTADOS: OrdenCompra['estado'][] = ['pendiente', 'aprobada', 'recibida', 'cancelada'];

// ---------------------------------------------------------------------------
// Helper: blank detail row
// ---------------------------------------------------------------------------

function blankItem(): DetalleItem {
  return {
    material_id: null,
    codigo_item: '',
    descripcion_item: '',
    cantidad: 1,
    unidad: 'pza',
    precio_unitario: 0,
    subtotal: 0,
  };
}

// ---------------------------------------------------------------------------
// Autocomplete component
// ---------------------------------------------------------------------------

function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (val: string, option?: { id: string; label: string; extra?: Record<string, string | number | null> }) => void;
  options: { id: string; label: string; extra?: Record<string, string | number | null> }[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes((search || value).toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={open ? search : value}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setSearch(value);
          setOpen(true);
        }}
        placeholder={placeholder}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.slice(0, 20).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => {
                onChange(opt.label, opt);
                setSearch(opt.label);
                setOpen(false);
              }}
            >
              <span className="truncate">{opt.label}</span>
              {opt.extra?.codigo && (
                <span className="ml-auto shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500">
                  {String(opt.extra.codigo)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Folio generator
// ---------------------------------------------------------------------------

function generateFolio(num: number): string {
  const yr = new Date().getFullYear().toString().slice(-2);
  return `RO-${String(num).padStart(3, '0')}-${yr}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrdenesPage() {
  const params = useParams();
  const projectId = params.id as string;

  // --- data ---
  const [ordenes, setOrdenes] = useState<(OrdenCompra & { proveedores?: Proveedor })[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  // --- filters ---
  const [filtroEstado, setFiltroEstado] = useState<EstadoFilter>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // --- modals ---
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEstadoModal, setShowEstadoModal] = useState(false);

  // --- form state ---
  const [editingOrden, setEditingOrden] = useState<OrdenCompra | null>(null);
  const [formProveedorId, setFormProveedorId] = useState('');
  const [formProveedorSearch, setFormProveedorSearch] = useState('');
  const [formFecha, setFormFecha] = useState('');
  const [formFechaEntrega, setFormFechaEntrega] = useState('');
  const [formObraProyecto, setFormObraProyecto] = useState('');
  const [formVendedor, setFormVendedor] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formItems, setFormItems] = useState<DetalleItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  // --- detail ---
  const [detailOrden, setDetailOrden] = useState<(OrdenCompra & { proveedores?: Proveedor }) | null>(null);
  const [detailItems, setDetailItems] = useState<OrdenDetalle[]>([]);

  // --- estado change ---
  const [estadoOrden, setEstadoOrden] = useState<OrdenCompra | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<OrdenCompra['estado']>('pendiente');

  // --- toast ---
  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastId = 0;

  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + toastId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ordenes_compra')
      .select('*, proveedores(*)')
      .eq('proyecto_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      addToast('Error al cargar ordenes: ' + error.message, 'error');
    } else {
      setOrdenes(data ?? []);
    }
    setLoading(false);
  }, [addToast, projectId]);

  const fetchProveedores = useCallback(async () => {
    const { data } = await supabase
      .from('proveedores')
      .select('*')
      .order('nombre');
    setProveedores(data ?? []);
  }, []);

  const fetchMateriales = useCallback(async () => {
    const { data } = await supabase
      .from('materiales')
      .select('*')
      .order('nombre');
    setMateriales(data ?? []);
  }, []);

  useEffect(() => {
    fetchOrdenes();
    fetchProveedores();
    fetchMateriales();
  }, [fetchOrdenes, fetchProveedores, fetchMateriales]);

  // ---------------------------------------------------------------------------
  // Filtered ordenes
  // ---------------------------------------------------------------------------

  const ordenesFiltradas = ordenes.filter((o) => {
    if (filtroEstado !== 'todos' && o.estado !== filtroEstado) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        o.numero_orden.toLowerCase().includes(term) ||
        (o.proveedores?.nombre ?? '').toLowerCase().includes(term) ||
        (o.obra_proyecto ?? '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  async function openCreateForm() {
    setEditingOrden(null);
    setFormProveedorId('');
    setFormProveedorSearch('');
    setFormFecha(new Date().toISOString().slice(0, 10));
    setFormFechaEntrega('');
    setFormObraProyecto('');
    setFormVendedor('');
    setFormNotas('');
    setFormItems([blankItem()]);
    setShowForm(true);
  }

  async function openEditForm(orden: OrdenCompra & { proveedores?: Proveedor }) {
    setEditingOrden(orden);
    setFormProveedorId(orden.proveedor_id || '');
    setFormProveedorSearch(orden.proveedores?.nombre || '');
    setFormFecha(orden.fecha);
    setFormFechaEntrega(orden.fecha_entrega || '');
    setFormObraProyecto(orden.obra_proyecto || '');
    setFormVendedor(orden.vendedor || '');
    setFormNotas(orden.notas || '');

    const { data: items } = await supabase
      .from('orden_detalle')
      .select('*')
      .eq('orden_id', orden.id)
      .order('created_at');

    setFormItems(
      items && items.length > 0
        ? items.map((i) => ({
            material_id: i.material_id,
            codigo_item: i.codigo_item || '',
            descripcion_item: i.descripcion_item,
            cantidad: i.cantidad,
            unidad: i.unidad,
            precio_unitario: i.precio_unitario,
            subtotal: i.subtotal,
          }))
        : [blankItem()]
    );
    setShowForm(true);
  }

  function selectProveedor(prov: Proveedor) {
    setFormProveedorId(prov.id);
    setFormProveedorSearch(prov.nombre);
  }

  function updateItem(index: number, field: keyof DetalleItem, value: string | number | null) {
    setFormItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      if (field === 'material_id' && value) {
        const mat = materiales.find((m) => m.id === value);
        if (mat) {
          item.descripcion_item = mat.nombre;
          item.unidad = mat.unidad;
          item.precio_unitario = mat.precio_unitario;
          item.codigo_item = mat.codigo || '';
        }
      }

      item.subtotal = item.cantidad * item.precio_unitario;
      next[index] = item;
      return next;
    });
  }

  function addItemRow() {
    setFormItems((prev) => [...prev, blankItem()]);
  }

  function removeItemRow(index: number) {
    setFormItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const formSubtotal = formItems.reduce((sum, i) => sum + i.cantidad * i.precio_unitario, 0);
  const formIva = formSubtotal * 0.16;
  const formTotal = formSubtotal + formIva;

  // ---------------------------------------------------------------------------
  // Save order (create or update)
  // ---------------------------------------------------------------------------

  async function handleSaveOrder() {
    if (!formProveedorId) {
      addToast('Selecciona un proveedor', 'error');
      return;
    }
    if (formItems.every((i) => !i.descripcion_item)) {
      addToast('Agrega al menos un item con descripcion', 'error');
      return;
    }

    setSaving(true);

    if (editingOrden) {
      // --- UPDATE ---
      const { error: orderError } = await supabase
        .from('ordenes_compra')
        .update({
          proveedor_id: formProveedorId,
          fecha: formFecha,
          fecha_entrega: formFechaEntrega || null,
          obra_proyecto: formObraProyecto || null,
          vendedor: formVendedor || null,
          subtotal: formSubtotal,
          iva: formIva,
          total: formTotal,
          notas: formNotas || null,
        })
        .eq('id', editingOrden.id);

      if (orderError) {
        addToast('Error al actualizar: ' + orderError.message, 'error');
        setSaving(false);
        return;
      }

      await supabase.from('orden_detalle').delete().eq('orden_id', editingOrden.id);

      const detailRows = formItems
        .filter((i) => i.descripcion_item)
        .map((i) => ({
          orden_id: editingOrden.id,
          material_id: i.material_id || null,
          codigo_item: i.codigo_item || null,
          descripcion_item: i.descripcion_item,
          cantidad: i.cantidad,
          unidad: i.unidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.cantidad * i.precio_unitario,
        }));

      if (detailRows.length > 0) {
        await supabase.from('orden_detalle').insert(detailRows);
      }

      addToast('Orden ' + editingOrden.numero_orden + ' actualizada correctamente');
    } else {
      // --- CREATE ---
      const { data: seqData } = await supabase.rpc('nextval', { seq_name: 'ordenes_folio_seq' }).single();
      const folioNum = typeof seqData === 'number' ? seqData : 1;
      const numero_orden = generateFolio(folioNum);

      const orderPayload = {
        numero_orden,
        proveedor_id: formProveedorId,
        fecha: formFecha,
        fecha_entrega: formFechaEntrega || null,
        estado: 'pendiente' as const,
        obra_proyecto: formObraProyecto || null,
        vendedor: formVendedor || null,
        folio_numero: folioNum,
        subtotal: formSubtotal,
        iva: formIva,
        total: formTotal,
        notas: formNotas || null,
        proyecto_id: projectId,
      };

      const { data: insertedOrder, error: orderError } = await supabase
        .from('ordenes_compra')
        .insert(orderPayload)
        .select()
        .single();

      if (orderError || !insertedOrder) {
        addToast('Error al crear la orden: ' + (orderError?.message ?? 'desconocido'), 'error');
        setSaving(false);
        return;
      }

      const detailRows = formItems
        .filter((i) => i.descripcion_item)
        .map((i) => ({
          orden_id: insertedOrder.id,
          material_id: i.material_id || null,
          codigo_item: i.codigo_item || null,
          descripcion_item: i.descripcion_item,
          cantidad: i.cantidad,
          unidad: i.unidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.cantidad * i.precio_unitario,
        }));

      if (detailRows.length > 0) {
        const { error: detailError } = await supabase.from('orden_detalle').insert(detailRows);
        if (detailError) {
          addToast('Orden creada pero error en detalle: ' + detailError.message, 'error');
        }
      }

      addToast('Orden ' + numero_orden + ' creada correctamente');
    }

    setSaving(false);
    setShowForm(false);
    fetchOrdenes();
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete(orden: OrdenCompra) {
    if (!confirm('Eliminar la orden ' + orden.numero_orden + '? Esta accion no se puede deshacer.')) return;

    await supabase.from('orden_detalle').delete().eq('orden_id', orden.id);
    const { error } = await supabase.from('ordenes_compra').delete().eq('id', orden.id);

    if (error) {
      addToast('Error al eliminar: ' + error.message, 'error');
    } else {
      addToast('Orden eliminada');
      fetchOrdenes();
    }
  }

  // ---------------------------------------------------------------------------
  // Change estado
  // ---------------------------------------------------------------------------

  function openEstadoModal(orden: OrdenCompra) {
    setEstadoOrden(orden);
    setNuevoEstado(orden.estado);
    setShowEstadoModal(true);
  }

  async function handleChangeEstado() {
    if (!estadoOrden) return;
    const { error } = await supabase
      .from('ordenes_compra')
      .update({ estado: nuevoEstado })
      .eq('id', estadoOrden.id);

    if (error) {
      addToast('Error al actualizar estado: ' + error.message, 'error');
    } else {
      addToast('Estado actualizado a ' + ESTADO_LABELS[nuevoEstado]);
      setShowEstadoModal(false);
      fetchOrdenes();
    }
  }

  // ---------------------------------------------------------------------------
  // View detail
  // ---------------------------------------------------------------------------

  async function openDetail(orden: OrdenCompra & { proveedores?: Proveedor }) {
    setDetailOrden(orden);
    const { data } = await supabase
      .from('orden_detalle')
      .select('*, materiales(*)')
      .eq('orden_id', orden.id)
      .order('created_at');
    setDetailItems(data ?? []);
    setShowDetail(true);
  }

  // ---------------------------------------------------------------------------
  // Build export data
  // ---------------------------------------------------------------------------

  async function buildExportData(orden: OrdenCompra & { proveedores?: Proveedor }): Promise<OCExportData> {
    const { data: items } = await supabase
      .from('orden_detalle')
      .select('*')
      .eq('orden_id', orden.id)
      .order('created_at');

    const prov = orden.proveedores;
    return {
      folio: orden.numero_orden,
      obra_proyecto: orden.obra_proyecto || '',
      fecha: formatDateShort(orden.fecha),
      proveedor_nombre: prov?.nombre ?? 'Sin proveedor',
      proveedor_rfc: prov?.rfc ?? '',
      proveedor_telefono: prov?.telefono ?? '',
      proveedor_email: prov?.email ?? '',
      vendedor: orden.vendedor || '',
      fecha_entrega: orden.fecha_entrega ? formatDateShort(orden.fecha_entrega) : '',
      items: (items ?? []).map((i) => ({
        codigo: i.codigo_item || '',
        descripcion: i.descripcion_item,
        unidad: i.unidad,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        importe: i.subtotal,
      })),
      subtotal: orden.subtotal,
      iva: orden.iva,
      total: orden.total,
      notas: orden.notas,
    };
  }

  async function handleExportExcel(orden: OrdenCompra & { proveedores?: Proveedor }) {
    const data = await buildExportData(orden);
    exportOCExcel(data);
    addToast('Excel generado con formato OC');
  }

  async function handleExportPDF(orden: OrdenCompra & { proveedores?: Proveedor }) {
    const data = await buildExportData(orden);
    exportOCPDF(data);
    addToast('PDF generado');
  }

  // ---------------------------------------------------------------------------
  // Material options for autocomplete
  // ---------------------------------------------------------------------------

  const materialOptions = materiales.map((m) => ({
    id: m.id,
    label: m.nombre,
    extra: { codigo: m.codigo, precio: m.precio_unitario, unidad: m.unidad } as Record<string, string | number | null>,
  }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-7xl space-y-6 pt-10 md:pt-0">
      {/* Toast notifications */}
      <div className="fixed right-4 top-4 z-[200] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-in flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {t.message}
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="ml-2 rounded hover:bg-white/20"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a365d]">
            <ShoppingCart className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Ordenes de Compra</h1>
            <p className="text-sm text-gray-500">
              {ordenesFiltradas.length} orden{ordenesFiltradas.length !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>

        <button
          onClick={openCreateForm}
          className="btn-primary flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          <Plus size={18} />
          Nueva Orden
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por folio, proveedor u obra..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as EstadoFilter)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
          ))}
        </select>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">Cargando...</div>
        ) : ordenesFiltradas.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl bg-white py-12 text-gray-400 shadow-sm ring-1 ring-gray-100">
            No se encontraron ordenes
          </div>
        ) : (
          ordenesFiltradas.map((orden) => (
            <div key={orden.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a365d]">{orden.numero_orden}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{orden.proveedores?.nombre ?? 'Sin proveedor'}</p>
                  {orden.obra_proyecto && (
                    <p className="mt-0.5 text-xs text-gray-400">{orden.obra_proyecto}</p>
                  )}
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_COLORS[orden.estado]}`}>
                  {ESTADO_LABELS[orden.estado]}
                </span>
              </div>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">{formatDate(orden.fecha)}</span>
                <span className="font-bold text-gray-900">{formatCurrency(orden.total)}</span>
              </div>
              <div className="grid grid-cols-5 gap-1 border-t border-gray-100 pt-3">
                <button onClick={() => openDetail(orden)} className="flex flex-col items-center rounded-lg py-2 text-xs font-medium text-gray-600 active:bg-gray-50">
                  <Eye size={16} className="mb-0.5" />Ver
                </button>
                <button onClick={() => openEditForm(orden)} className="flex flex-col items-center rounded-lg py-2 text-xs font-medium text-gray-600 active:bg-gray-50">
                  <Edit2 size={16} className="mb-0.5" />Editar
                </button>
                <button onClick={() => handleExportPDF(orden)} className="flex flex-col items-center rounded-lg py-2 text-xs font-medium text-gray-600 active:bg-gray-50">
                  <FileText size={16} className="mb-0.5" />PDF
                </button>
                <button onClick={() => handleExportExcel(orden)} className="flex flex-col items-center rounded-lg py-2 text-xs font-medium text-gray-600 active:bg-gray-50">
                  <FileSpreadsheet size={16} className="mb-0.5" />Excel
                </button>
                <button onClick={() => handleDelete(orden)} className="flex flex-col items-center rounded-lg py-2 text-xs font-medium text-red-500 active:bg-red-50">
                  <Trash2 size={16} className="mb-0.5" />Borrar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 font-semibold text-gray-700">Folio</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Proveedor</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Obra / Proyecto</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Fecha</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Estado</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : ordenesFiltradas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No se encontraron ordenes</td></tr>
              ) : (
                ordenesFiltradas.map((orden) => (
                  <tr key={orden.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#1a365d]">{orden.numero_orden}</td>
                    <td className="px-4 py-3 text-gray-700">{orden.proveedores?.nombre ?? 'Sin proveedor'}</td>
                    <td className="px-4 py-3 text-gray-600">{orden.obra_proyecto || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(orden.fecha)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEstadoModal(orden)}
                        className={`inline-block cursor-pointer rounded-full px-2.5 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80 ${ESTADO_COLORS[orden.estado]}`}
                      >
                        {ESTADO_LABELS[orden.estado]}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(orden.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openDetail(orden)} title="Ver detalle" className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => openEditForm(orden)} title="Editar" className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-yellow-50 hover:text-yellow-600">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleExportPDF(orden)} title="Exportar PDF" className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600">
                          <FileText size={16} />
                        </button>
                        <button onClick={() => handleExportExcel(orden)} title="Exportar Excel" className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-green-50 hover:text-green-600">
                          <FileSpreadsheet size={16} />
                        </button>
                        <button onClick={() => handleDelete(orden)} title="Eliminar" className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600">
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

      {/* ================================================================= */}
      {/* CREATE / EDIT ORDER MODAL                                         */}
      {/* ================================================================= */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingOrden ? `Editar ${editingOrden.numero_orden}` : 'Nueva Orden de Compra'} size="xl">
        <div className="space-y-5">
          {/* Company header (read-only) */}
          <div className="rounded-lg bg-[#1a365d]/5 p-3">
            <p className="text-sm font-bold text-[#1a365d]">MARTIN ARMANDO ROJAS PACHECO</p>
            <p className="text-xs text-gray-500">RFC: ROPM6310199LA | compras@acabadosro.com</p>
          </div>

          {/* Obra/Proyecto & Dates */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Obra / Proyecto</label>
              <input
                type="text"
                value={formObraProyecto}
                onChange={(e) => setFormObraProyecto(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                placeholder="Ej: HOTEL TRU"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fecha Emision *</label>
              <input
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fecha Entrega</label>
              <input
                type="date"
                value={formFechaEntrega}
                onChange={(e) => setFormFechaEntrega(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              />
            </div>
          </div>

          {/* Proveedor & Vendedor */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Proveedor *</label>
              <AutocompleteInput
                value={formProveedorSearch}
                onChange={(val, opt) => {
                  setFormProveedorSearch(val);
                  if (opt) {
                    const prov = proveedores.find((p) => p.id === opt.id);
                    if (prov) selectProveedor(prov);
                  } else {
                    setFormProveedorId('');
                  }
                }}
                options={proveedores.map((p) => ({
                  id: p.id,
                  label: p.nombre,
                  extra: { rfc: p.rfc, telefono: p.telefono } as Record<string, string | number | null>,
                }))}
                placeholder="Buscar proveedor..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              />
              {formProveedorId && (() => {
                const prov = proveedores.find((p) => p.id === formProveedorId);
                if (!prov) return null;
                return (
                  <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-1 text-xs text-green-700">
                    <Check size={12} />
                    <span>{prov.nombre}</span>
                    {prov.rfc && <span className="font-mono text-green-600">({prov.rfc})</span>}
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Vendedor</label>
              <input
                type="text"
                value={formVendedor}
                onChange={(e) => setFormVendedor(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                placeholder="Nombre del vendedor"
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
            <textarea
              value={formNotas}
              onChange={(e) => setFormNotas(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              placeholder="Observaciones adicionales..."
            />
          </div>

          {/* Items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Items de la Orden</h3>
              <button
                type="button"
                onClick={addItemRow}
                className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                <Plus size={14} />
                Agregar
              </button>
            </div>

            <div className="space-y-3">
              {formItems.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {/* Row 1: Material selector + Code */}
                  <div className="mb-2 grid grid-cols-12 gap-2">
                    <div className="col-span-12 sm:col-span-4">
                      <label className="mb-1 block text-xs text-gray-500">Material</label>
                      <select
                        value={item.material_id ?? ''}
                        onChange={(e) => updateItem(idx, 'material_id', e.target.value || null)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                      >
                        <option value="">Personalizado</option>
                        {materiales.map((m) => (
                          <option key={m.id} value={m.id}>{m.codigo ? `${m.codigo} - ` : ''}{m.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <label className="mb-1 block text-xs text-gray-500">Codigo SKU</label>
                      <input
                        type="text"
                        value={item.codigo_item}
                        onChange={(e) => updateItem(idx, 'codigo_item', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-sm focus:border-[#1a365d] focus:outline-none"
                        placeholder="SKU"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-6">
                      <label className="mb-1 block text-xs text-gray-500">Descripcion</label>
                      <input
                        type="text"
                        value={item.descripcion_item}
                        onChange={(e) => updateItem(idx, 'descripcion_item', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                        placeholder="Descripcion del item"
                      />
                    </div>
                  </div>
                  {/* Row 2: Qty, Unit, Price, Subtotal, Remove */}
                  <div className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-3 sm:col-span-2">
                      <label className="mb-1 block text-xs text-gray-500">Cant.</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.cantidad}
                        onChange={(e) => updateItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <label className="mb-1 block text-xs text-gray-500">Unidad</label>
                      <input
                        type="text"
                        value={item.unidad}
                        onChange={(e) => updateItem(idx, 'unidad', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-3">
                      <label className="mb-1 block text-xs text-gray-500">P. Unitario</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.precio_unitario}
                        onChange={(e) => updateItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-3">
                      <label className="mb-1 block text-xs text-gray-500">Importe</label>
                      <div className="rounded bg-white px-2 py-1.5 text-sm font-semibold text-[#1a365d]">
                        {formatCurrency(item.cantidad * item.precio_unitario)}
                      </div>
                    </div>
                    <div className="col-span-4 flex justify-end sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        disabled={formItems.length === 1}
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:w-64">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(formSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>IVA (16%)</span>
                <span>{formatCurrency(formIva)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-bold text-[#1a365d]">
                <span>Total</span>
                <span>{formatCurrency(formTotal)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={saving}
              className="btn-primary flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editingOrden ? 'Actualizar Orden' : 'Guardar Orden'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* VIEW DETAIL MODAL                                                 */}
      {/* ================================================================= */}
      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={'Orden ' + (detailOrden?.numero_orden ?? '')}
        size="xl"
      >
        {detailOrden && (
          <div className="space-y-4">
            {/* Company header */}
            <div className="rounded-lg bg-[#1a365d]/5 p-3">
              <p className="text-sm font-bold text-[#1a365d]">MARTIN ARMANDO ROJAS PACHECO</p>
              <p className="text-xs text-gray-500">RFC: ROPM6310199LA | compras@acabadosro.com</p>
            </div>

            {/* Order + Supplier info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 text-sm">
                <p><span className="font-semibold text-gray-700">Proveedor: </span>{detailOrden.proveedores?.nombre ?? 'Sin proveedor'}</p>
                {detailOrden.proveedores?.rfc && (
                  <p><span className="font-semibold text-gray-700">RFC: </span><span className="font-mono">{detailOrden.proveedores.rfc}</span></p>
                )}
                {detailOrden.proveedores?.telefono && (
                  <p><span className="font-semibold text-gray-700">Tel: </span>{detailOrden.proveedores.telefono}</p>
                )}
                {detailOrden.proveedores?.email && (
                  <p><span className="font-semibold text-gray-700">Correo: </span>{detailOrden.proveedores.email}</p>
                )}
              </div>
              <div className="space-y-1.5 text-sm">
                {detailOrden.obra_proyecto && (
                  <p><span className="font-semibold text-gray-700">Obra: </span>{detailOrden.obra_proyecto}</p>
                )}
                <p><span className="font-semibold text-gray-700">Fecha: </span>{formatDate(detailOrden.fecha)}</p>
                {detailOrden.fecha_entrega && (
                  <p><span className="font-semibold text-gray-700">Entrega: </span>{formatDate(detailOrden.fecha_entrega)}</p>
                )}
                {detailOrden.vendedor && (
                  <p><span className="font-semibold text-gray-700">Vendedor: </span>{detailOrden.vendedor}</p>
                )}
                <p>
                  <span className="font-semibold text-gray-700">Estado: </span>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_COLORS[detailOrden.estado]}`}>
                    {ESTADO_LABELS[detailOrden.estado]}
                  </span>
                </p>
                {detailOrden.notas && (
                  <p><span className="font-semibold text-gray-700">Notas: </span>{detailOrden.notas}</p>
                )}
              </div>
            </div>

            {/* Items - Mobile cards */}
            <div className="space-y-2 sm:hidden">
              {detailItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Sin items</p>
              ) : (
                detailItems.map((item, idx) => (
                  <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-1 flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{idx + 1}. {item.descripcion_item}</p>
                        {item.codigo_item && <p className="font-mono text-xs text-gray-400">{item.codigo_item}</p>}
                      </div>
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(item.subtotal)}</p>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>{item.cantidad} {item.unidad}</span>
                      <span>@ {formatCurrency(item.precio_unitario)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Items - Desktop table */}
            <div className="hidden overflow-hidden rounded-lg border border-gray-200 sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2 font-semibold text-gray-700">#</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Codigo</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Descripcion</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Unidad</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Cant.</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">P. Unitario</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.codigo_item || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{item.descripcion_item}</td>
                      <td className="px-3 py-2 text-gray-700">{item.unidad}</td>
                      <td className="px-3 py-2 text-gray-700">{item.cantidad}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(item.precio_unitario)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                  {detailItems.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Sin items</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:w-64">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(detailOrden.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>IVA (16%)</span>
                  <span>{formatCurrency(detailOrden.iva)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-bold text-[#1a365d]">
                  <span>Total</span>
                  <span>{formatCurrency(detailOrden.total)}</span>
                </div>
              </div>
            </div>

            {/* Export buttons */}
            <div className="flex flex-col gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
              <button
                onClick={() => handleExportExcel(detailOrden)}
                className="flex items-center justify-center gap-2 rounded-lg border border-green-600 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50"
              >
                <FileSpreadsheet size={16} />
                Descargar Excel
              </button>
              <button
                onClick={() => handleExportPDF(detailOrden)}
                className="btn-primary flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              >
                <FileText size={16} />
                Descargar PDF
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* CHANGE ESTADO MODAL                                               */}
      {/* ================================================================= */}
      <Modal
        isOpen={showEstadoModal}
        onClose={() => setShowEstadoModal(false)}
        title="Cambiar Estado"
        size="sm"
      >
        {estadoOrden && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Orden: <span className="font-semibold">{estadoOrden.numero_orden}</span>
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nuevo Estado</label>
              <select
                value={nuevoEstado}
                onChange={(e) => setNuevoEstado(e.target.value as OrdenCompra['estado'])}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{ESTADO_LABELS[e]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowEstadoModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangeEstado}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium"
              >
                Actualizar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
