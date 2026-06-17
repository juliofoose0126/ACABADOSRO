'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OrdenCompra, OrdenDetalle, Material, Proveedor } from '@/lib/types';
import { exportToExcel, exportOrdenCompraPDF, formatCurrency, formatDate } from '@/lib/export-utils';
import Modal from '@/components/Modal';
import {
  Plus,
  Eye,
  FileText,
  FileSpreadsheet,
  Trash2,
  ShoppingCart,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DetalleItem {
  material_id: string | null;
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
    descripcion_item: '',
    cantidad: 1,
    unidad: 'pza',
    precio_unitario: 0,
    subtotal: 0,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrdenesPage() {
  // --- data ---
  const [ordenes, setOrdenes] = useState<(OrdenCompra & { proveedores?: Proveedor })[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  // --- filters ---
  const [filtroEstado, setFiltroEstado] = useState<EstadoFilter>('todos');

  // --- modals ---
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEstadoModal, setShowEstadoModal] = useState(false);

  // --- form state ---
  const [editingOrden, setEditingOrden] = useState<OrdenCompra | null>(null);
  const [formProveedorId, setFormProveedorId] = useState('');
  const [formFecha, setFormFecha] = useState('');
  const [formFechaEntrega, setFormFechaEntrega] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formItems, setFormItems] = useState<DetalleItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  // --- detail ---
  const [detailOrden, setDetailOrden] = useState<OrdenCompra | null>(null);
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
      .order('created_at', { ascending: false });

    if (error) {
      addToast('Error al cargar órdenes: ' + error.message, 'error');
    } else {
      setOrdenes(data ?? []);
    }
    setLoading(false);
  }, [addToast]);

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

  const ordenesFiltradas =
    filtroEstado === 'todos'
      ? ordenes
      : ordenes.filter((o) => o.estado === filtroEstado);

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  function openCreateForm() {
    setEditingOrden(null);
    setFormProveedorId('');
    setFormFecha(new Date().toISOString().slice(0, 10));
    setFormFechaEntrega('');
    setFormNotas('');
    setFormItems([blankItem()]);
    setShowForm(true);
  }

  function updateItem(index: number, field: keyof DetalleItem, value: string | number | null) {
    setFormItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      // auto-fill from material
      if (field === 'material_id' && value) {
        const mat = materiales.find((m) => m.id === value);
        if (mat) {
          item.descripcion_item = mat.nombre;
          item.unidad = mat.unidad;
          item.precio_unitario = mat.precio_unitario;
        }
      }

      // recalc subtotal
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
  // Save order
  // ---------------------------------------------------------------------------

  async function handleSaveOrder() {
    if (!formProveedorId) {
      addToast('Selecciona un proveedor', 'error');
      return;
    }
    if (formItems.every((i) => !i.descripcion_item)) {
      addToast('Agrega al menos un item con descripción', 'error');
      return;
    }

    setSaving(true);

    const numero_orden = 'OC-' + Date.now();

    const orderPayload = {
      numero_orden,
      proveedor_id: formProveedorId,
      fecha: formFecha,
      fecha_entrega: formFechaEntrega || null,
      estado: 'pendiente' as const,
      subtotal: formSubtotal,
      iva: formIva,
      total: formTotal,
      notas: formNotas || null,
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
        descripcion_item: i.descripcion_item,
        cantidad: i.cantidad,
        unidad: i.unidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.cantidad * i.precio_unitario,
      }));

    if (detailRows.length > 0) {
      const { error: detailError } = await supabase
        .from('orden_detalle')
        .insert(detailRows);

      if (detailError) {
        addToast('Orden creada pero error en detalle: ' + detailError.message, 'error');
      }
    }

    addToast('Orden ' + numero_orden + ' creada correctamente');
    setSaving(false);
    setShowForm(false);
    fetchOrdenes();
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete(orden: OrdenCompra) {
    if (!confirm('¿Eliminar la orden ' + orden.numero_orden + '? Esta acción no se puede deshacer.')) return;

    // delete detail first (FK)
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

  async function openDetail(orden: OrdenCompra) {
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
  // Exports
  // ---------------------------------------------------------------------------

  async function handleExportPDF(orden: OrdenCompra & { proveedores?: Proveedor }) {
    const { data: items } = await supabase
      .from('orden_detalle')
      .select('*')
      .eq('orden_id', orden.id)
      .order('created_at');

    const proveedor = orden.proveedores;
    exportOrdenCompraPDF({
      numero_orden: orden.numero_orden,
      fecha: formatDate(orden.fecha),
      fecha_entrega: orden.fecha_entrega ? formatDate(orden.fecha_entrega) : null,
      proveedor: proveedor?.nombre ?? 'Sin proveedor',
      contacto: proveedor?.contacto ?? undefined,
      telefono: proveedor?.telefono ?? undefined,
      notas: orden.notas,
      items: (items ?? []).map((i) => ({
        descripcion: i.descripcion_item,
        cantidad: i.cantidad,
        unidad: i.unidad,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal,
      })),
      subtotal: orden.subtotal,
      iva: orden.iva,
      total: orden.total,
    });
    addToast('PDF generado');
  }

  async function handleExportExcel(orden: OrdenCompra & { proveedores?: Proveedor }) {
    const { data: items } = await supabase
      .from('orden_detalle')
      .select('*')
      .eq('orden_id', orden.id)
      .order('created_at');

    const rows = (items ?? []).map((i, idx) => ({
      num: idx + 1,
      descripcion: i.descripcion_item,
      cantidad: i.cantidad,
      unidad: i.unidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
    }));

    exportToExcel(
      rows as unknown as Record<string, unknown>[],
      [
        { key: 'num', label: '#' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'unidad', label: 'Unidad' },
        { key: 'precio_unitario', label: 'P. Unitario' },
        { key: 'subtotal', label: 'Subtotal' },
      ],
      `Orden_${orden.numero_orden}`,
      'Detalle'
    );
    addToast('Excel generado');
  }

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
            className={`animate-slide-in flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all ${
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
            <h1 className="text-2xl font-bold text-gray-900">Órdenes de Compra</h1>
            <p className="text-sm text-gray-500">
              {ordenesFiltradas.length} orden{ordenesFiltradas.length !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
          >
            <option value="todos">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABELS[e]}
              </option>
            ))}
          </select>

          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
          >
            <Plus size={18} />
            Nueva Orden
          </button>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">Cargando...</div>
        ) : ordenesFiltradas.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl bg-white py-12 text-gray-400 shadow-sm ring-1 ring-gray-100">
            No se encontraron órdenes
          </div>
        ) : (
          ordenesFiltradas.map((orden) => (
            <div key={orden.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-[#1a365d]">{orden.numero_orden}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{orden.proveedores?.nombre ?? 'Sin proveedor'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_COLORS[orden.estado]}`}>
                  {ESTADO_LABELS[orden.estado]}
                </span>
              </div>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">{formatDate(orden.fecha)}</span>
                <span className="font-bold text-gray-900">{formatCurrency(orden.total)}</span>
              </div>
              <div className="flex items-center gap-1 border-t border-gray-100 pt-3">
                <button onClick={() => openDetail(orden)} className="flex-1 rounded-lg bg-gray-50 py-2 text-center text-xs font-medium text-gray-700 transition-colors active:bg-gray-100">
                  <Eye size={14} className="mx-auto mb-0.5" />Ver
                </button>
                <button onClick={() => openEstadoModal(orden)} className="flex-1 rounded-lg bg-gray-50 py-2 text-center text-xs font-medium text-gray-700 transition-colors active:bg-gray-100">
                  <ShoppingCart size={14} className="mx-auto mb-0.5" />Estado
                </button>
                <button onClick={() => handleExportPDF(orden)} className="flex-1 rounded-lg bg-gray-50 py-2 text-center text-xs font-medium text-gray-700 transition-colors active:bg-gray-100">
                  <FileText size={14} className="mx-auto mb-0.5" />PDF
                </button>
                <button onClick={() => handleExportExcel(orden)} className="flex-1 rounded-lg bg-gray-50 py-2 text-center text-xs font-medium text-gray-700 transition-colors active:bg-gray-100">
                  <FileSpreadsheet size={14} className="mx-auto mb-0.5" />Excel
                </button>
                <button onClick={() => handleDelete(orden)} className="flex-1 rounded-lg bg-gray-50 py-2 text-center text-xs font-medium text-red-600 transition-colors active:bg-red-50">
                  <Trash2 size={14} className="mx-auto mb-0.5" />Borrar
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
                <th className="px-4 py-3 font-semibold text-gray-700"># Orden</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Proveedor</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Fecha</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Estado</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    Cargando...
                  </td>
                </tr>
              ) : ordenesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    No se encontraron órdenes
                  </td>
                </tr>
              ) : (
                ordenesFiltradas.map((orden) => (
                  <tr key={orden.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#1a365d]">{orden.numero_orden}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {orden.proveedores?.nombre ?? 'Sin proveedor'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(orden.fecha)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_COLORS[orden.estado]}`}
                      >
                        {ESTADO_LABELS[orden.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(orden.total)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openDetail(orden)}
                          title="Ver detalle"
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openEstadoModal(orden)}
                          title="Cambiar estado"
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-yellow-50 hover:text-yellow-600"
                        >
                          <ShoppingCart size={16} />
                        </button>
                        <button
                          onClick={() => handleExportPDF(orden)}
                          title="Exportar PDF"
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          onClick={() => handleExportExcel(orden)}
                          title="Exportar Excel"
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-green-50 hover:text-green-600"
                        >
                          <FileSpreadsheet size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(orden)}
                          title="Eliminar"
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
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
      {/* CREATE ORDER MODAL                                                */}
      {/* ================================================================= */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Nueva Orden de Compra" size="xl">
        <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
          {/* Proveedor & dates */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Proveedor *</label>
              <select
                value={formProveedorId}
                onChange={(e) => setFormProveedorId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              >
                <option value="">Seleccionar...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fecha</label>
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
                Agregar Item
              </button>
            </div>

            <div className="space-y-3">
              {formItems.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                  {/* Material dropdown */}
                  <div className="col-span-12 sm:col-span-3">
                    <label className="mb-1 block text-xs text-gray-500">Material</label>
                    <select
                      value={item.material_id ?? ''}
                      onChange={(e) =>
                        updateItem(idx, 'material_id', e.target.value || null)
                      }
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                    >
                      <option value="">Personalizado</option>
                      {materiales.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Description */}
                  <div className="col-span-12 sm:col-span-3">
                    <label className="mb-1 block text-xs text-gray-500">Descripción</label>
                    <input
                      type="text"
                      value={item.descripcion_item}
                      onChange={(e) => updateItem(idx, 'descripcion_item', e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                      placeholder="Descripción del item"
                    />
                  </div>

                  {/* Cantidad */}
                  <div className="col-span-4 sm:col-span-1">
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

                  {/* Unidad */}
                  <div className="col-span-4 sm:col-span-1">
                    <label className="mb-1 block text-xs text-gray-500">Unidad</label>
                    <input
                      type="text"
                      value={item.unidad}
                      onChange={(e) => updateItem(idx, 'unidad', e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                    />
                  </div>

                  {/* Precio unitario */}
                  <div className="col-span-4 sm:col-span-2">
                    <label className="mb-1 block text-xs text-gray-500">P. Unitario</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.precio_unitario}
                      onChange={(e) =>
                        updateItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)
                      }
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-[#1a365d] focus:outline-none"
                    />
                  </div>

                  {/* Subtotal (read-only) */}
                  <div className="col-span-10 sm:col-span-1">
                    <label className="mb-1 block text-xs text-gray-500">Subtotal</label>
                    <div className="rounded bg-white px-2 py-1.5 text-sm font-medium text-gray-700">
                      {formatCurrency(item.cantidad * item.precio_unitario)}
                    </div>
                  </div>

                  {/* Remove */}
                  <div className="col-span-2 flex justify-end sm:col-span-1">
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      disabled={formItems.length === 1}
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Eliminar item"
                    >
                      <X size={16} />
                    </button>
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
              <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-bold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(formTotal)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[#1a365d] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f] disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Orden'}
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
          <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
            {/* Header info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold text-gray-700">Proveedor: </span>
                  {detailOrden.proveedores?.nombre ?? 'Sin proveedor'}
                </p>
                <p>
                  <span className="font-semibold text-gray-700">Fecha: </span>
                  {formatDate(detailOrden.fecha)}
                </p>
                {detailOrden.fecha_entrega && (
                  <p>
                    <span className="font-semibold text-gray-700">Fecha Entrega: </span>
                    {formatDate(detailOrden.fecha_entrega)}
                  </p>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold text-gray-700">Estado: </span>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_COLORS[detailOrden.estado]}`}
                  >
                    {ESTADO_LABELS[detailOrden.estado]}
                  </span>
                </p>
                {detailOrden.notas && (
                  <p>
                    <span className="font-semibold text-gray-700">Notas: </span>
                    {detailOrden.notas}
                  </p>
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
                      <p className="text-sm font-medium text-gray-900">
                        {idx + 1}. {item.descripcion_item}
                      </p>
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
                    <th className="px-3 py-2 font-semibold text-gray-700">Descripción</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Cant.</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Unidad</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">P. Unitario</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-2 text-gray-700">{item.descripcion_item}</td>
                      <td className="px-3 py-2 text-gray-700">{item.cantidad}</td>
                      <td className="px-3 py-2 text-gray-700">{item.unidad}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {formatCurrency(item.precio_unitario)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                  {detailItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                        Sin items
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(detailOrden.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>IVA (16%)</span>
                  <span>{formatCurrency(detailOrden.iva)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-300 pt-1 text-base font-bold text-gray-900">
                  <span>Total</span>
                  <span>{formatCurrency(detailOrden.total)}</span>
                </div>
              </div>
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
                  <option key={e} value={e}>
                    {ESTADO_LABELS[e]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowEstadoModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangeEstado}
                className="rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
              >
                Actualizar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Inline keyframe for toast animation */}
      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
