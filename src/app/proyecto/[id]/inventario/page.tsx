'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Material, CategoriaMaterial, Proveedor } from '@/lib/types';
import Modal from '@/components/Modal';
import Toast from '@/components/Toast';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Package,
  AlertTriangle,
  FileUp,
  X,
  Upload,
  Eye,
  ChevronDown,
} from 'lucide-react';

interface FormData {
  codigo: string;
  nombre: string;
  categoria_id: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  stock_minimo: number;
  descripcion: string;
}

interface FacturaItem {
  material_id: string;
  cantidad: number;
  precio_unitario: number;
}

interface Factura {
  id: string;
  numero_factura: string;
  proveedor_id: string | null;
  fecha: string;
  archivo_url: string | null;
  notas: string | null;
  created_at: string;
  proveedores?: { nombre: string } | null;
}

const emptyForm: FormData = {
  codigo: '',
  nombre: '',
  categoria_id: '',
  unidad: '',
  cantidad: 0,
  precio_unitario: 0,
  stock_minimo: 0,
  descripcion: '',
};

function formatMXN(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
}

export default function InventarioPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<CategoriaMaterial[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFacturaModalOpen, setIsFacturaModalOpen] = useState(false);
  const [isFacturasListOpen, setIsFacturasListOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState<Material | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [facturaNumero, setFacturaNumero] = useState('');
  const [facturaProveedor, setFacturaProveedor] = useState('');
  const [facturaFecha, setFacturaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [facturaNotas, setFacturaNotas] = useState('');
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [facturaItems, setFacturaItems] = useState<FacturaItem[]>([{ material_id: '', cantidad: 0, precio_unitario: 0 }]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from('categorias_material').select('*').order('nombre');
    setCategories(data ?? []);
  }, []);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('materiales').select('*, categorias_material(nombre)').order('nombre');
    setMaterials(data ?? []);
    setLoading(false);
  }, []);

  const fetchProveedores = useCallback(async () => {
    const { data } = await supabase.from('proveedores').select('*').order('nombre');
    setProveedores(data ?? []);
  }, []);

  const fetchFacturas = useCallback(async () => {
    const { data } = await supabase
      .from('facturas')
      .select('*, proveedores(nombre)')
      .order('created_at', { ascending: false })
      .limit(20);
    setFacturas(data ?? []);
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchMaterials();
    fetchProveedores();
    fetchFacturas();
  }, [fetchCategories, fetchMaterials, fetchProveedores, fetchFacturas]);

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch = searchTerm === '' ||
      m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.codigo ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === '' || m.categoria_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'cantidad' || name === 'precio_unitario' || name === 'stock_minimo' ? Number(value) : value,
    }));
  }

  function resetAndCloseModals() {
    setFormData(emptyForm);
    setEditingMaterial(null);
    setDeletingMaterial(null);
    setIsAddModalOpen(false);
    setIsEditModalOpen(false);
    setIsDeleteModalOpen(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('materiales').insert({
      codigo: formData.codigo || null,
      nombre: formData.nombre,
      categoria_id: formData.categoria_id || null,
      unidad: formData.unidad,
      cantidad: formData.cantidad,
      precio_unitario: formData.precio_unitario,
      stock_minimo: formData.stock_minimo,
      descripcion: formData.descripcion || null,
    });
    setSaving(false);
    if (error) { setToast({ message: 'Error: ' + error.message, type: 'error' }); return; }
    setToast({ message: 'Material agregado', type: 'success' });
    resetAndCloseModals();
    fetchMaterials();
  }

  function openEditModal(material: Material) {
    setEditingMaterial(material);
    setFormData({
      codigo: material.codigo ?? '',
      nombre: material.nombre,
      categoria_id: material.categoria_id ?? '',
      unidad: material.unidad,
      cantidad: material.cantidad,
      precio_unitario: material.precio_unitario,
      stock_minimo: material.stock_minimo,
      descripcion: material.descripcion ?? '',
    });
    setIsEditModalOpen(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMaterial) return;
    setSaving(true);
    const { error } = await supabase.from('materiales').update({
      codigo: formData.codigo || null,
      nombre: formData.nombre,
      categoria_id: formData.categoria_id || null,
      unidad: formData.unidad,
      cantidad: formData.cantidad,
      precio_unitario: formData.precio_unitario,
      stock_minimo: formData.stock_minimo,
      descripcion: formData.descripcion || null,
    }).eq('id', editingMaterial.id);
    setSaving(false);
    if (error) { setToast({ message: 'Error: ' + error.message, type: 'error' }); return; }
    setToast({ message: 'Material actualizado', type: 'success' });
    resetAndCloseModals();
    fetchMaterials();
  }

  async function handleDelete() {
    if (!deletingMaterial) return;
    setSaving(true);
    const { error } = await supabase.from('materiales').delete().eq('id', deletingMaterial.id);
    setSaving(false);
    if (error) { setToast({ message: 'Error: ' + error.message, type: 'error' }); return; }
    setToast({ message: 'Material eliminado', type: 'success' });
    resetAndCloseModals();
    fetchMaterials();
  }

  function openFacturaModal() {
    setFacturaNumero('');
    setFacturaProveedor('');
    setFacturaFecha(new Date().toISOString().slice(0, 10));
    setFacturaNotas('');
    setFacturaFile(null);
    setFacturaItems([{ material_id: '', cantidad: 0, precio_unitario: 0 }]);
    setIsFacturaModalOpen(true);
  }

  function addFacturaItem() {
    setFacturaItems((prev) => [...prev, { material_id: '', cantidad: 0, precio_unitario: 0 }]);
  }

  function updateFacturaItem(idx: number, field: keyof FacturaItem, value: string | number) {
    setFacturaItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function removeFacturaItem(idx: number) {
    setFacturaItems((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  }

  async function handleSaveFactura() {
    if (!facturaNumero.trim()) {
      setToast({ message: 'Ingresa el número de factura', type: 'error' });
      return;
    }
    const validItems = facturaItems.filter((i) => i.material_id && i.cantidad > 0);
    if (validItems.length === 0) {
      setToast({ message: 'Agrega al menos un material con cantidad', type: 'error' });
      return;
    }

    setSaving(true);

    let archivo_url: string | null = null;
    if (facturaFile) {
      const ext = facturaFile.name.split('.').pop();
      const path = `${Date.now()}_${facturaNumero.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('facturas')
        .upload(path, facturaFile);
      if (uploadError) {
        setToast({ message: 'Error al subir archivo: ' + uploadError.message, type: 'error' });
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('facturas').getPublicUrl(path);
      archivo_url = urlData.publicUrl;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data: factura, error: facturaError } = await supabase
      .from('facturas')
      .insert({
        numero_factura: facturaNumero.trim(),
        proveedor_id: facturaProveedor || null,
        fecha: facturaFecha,
        archivo_url,
        notas: facturaNotas.trim() || null,
        created_by: user?.id || null,
      })
      .select()
      .single();

    if (facturaError || !factura) {
      setToast({ message: 'Error al guardar factura: ' + (facturaError?.message ?? ''), type: 'error' });
      setSaving(false);
      return;
    }

    const detalles = validItems.map((item) => ({
      factura_id: factura.id,
      material_id: item.material_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.cantidad * item.precio_unitario,
    }));

    const { error: detalleError } = await supabase.from('factura_detalles').insert(detalles);
    if (detalleError) {
      setToast({ message: 'Error en detalles: ' + detalleError.message, type: 'error' });
      setSaving(false);
      return;
    }

    for (const item of validItems) {
      const mat = materials.find((m) => m.id === item.material_id);
      if (mat) {
        await supabase
          .from('materiales')
          .update({ cantidad: mat.cantidad - item.cantidad })
          .eq('id', item.material_id);
      }
    }

    setSaving(false);
    setIsFacturaModalOpen(false);
    setToast({ message: 'Factura registrada y cantidades descontadas del inventario', type: 'success' });
    fetchMaterials();
    fetchFacturas();
  }

  function renderForm(onSubmit: (e: React.FormEvent) => void) {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Codigo</label>
            <input type="text" name="codigo" value={formData.codigo} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              placeholder="Ej. MAT-001" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre <span className="text-red-500">*</span></label>
            <input type="text" name="nombre" value={formData.nombre} onChange={handleChange} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              placeholder="Nombre del material" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Categoria</label>
            <select name="categoria_id" value={formData.categoria_id} onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]">
              <option value="">Sin categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Unidad <span className="text-red-500">*</span></label>
            <input type="text" name="unidad" value={formData.unidad} onChange={handleChange} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              placeholder="Ej. pza, kg, m" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Cantidad</label>
            <input type="number" name="cantidad" value={formData.cantidad} onChange={handleChange} min={0} step="0.01"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Precio Unit.</label>
            <input type="number" name="precio_unitario" value={formData.precio_unitario} onChange={handleChange} min={0} step="0.01"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Stock Min.</label>
            <input type="number" name="stock_minimo" value={formData.stock_minimo} onChange={handleChange} min={0} step="0.01"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Descripcion</label>
          <textarea name="descripcion" value={formData.descripcion} onChange={handleChange} rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            placeholder="Descripcion opcional" />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={resetAndCloseModals}
            className="btn-secondary rounded-lg px-4 py-2.5 text-sm font-medium">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="btn-primary rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4 pt-10 md:pt-0">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#1a365d] to-[#2a4a7f]">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Inventario</h1>
            <p className="text-xs text-gray-500">{materials.length} materiales</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setFormData(emptyForm); setIsAddModalOpen(true); }}
            className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white sm:flex-none">
            <Plus className="h-4 w-4" /> Material
          </button>
          <button onClick={openFacturaModal}
            className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold sm:flex-none">
            <FileUp className="h-4 w-4" /> Registrar Factura
          </button>
          <button onClick={() => setIsFacturasListOpen(true)}
            className="btn-secondary flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium sm:flex-none">
            <Eye className="h-4 w-4" /> Facturas
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar por nombre o código..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]" />
        </div>
        <div className="relative">
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2.5 pr-8 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d] sm:w-48">
            <option value="">Todas las categorias</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card-modern animate-pulse bg-white p-4">
              <div className="mb-3 h-4 w-3/4 rounded bg-gray-200" />
              <div className="space-y-2">
                <div className="h-3 w-1/2 rounded bg-gray-200" />
                <div className="h-3 w-1/3 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="card-modern flex flex-col items-center justify-center bg-white py-16">
          <Package size={48} className="mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">{searchTerm ? 'Sin resultados' : 'No hay materiales'}</p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {filteredMaterials.map((m, idx) => {
              const isLow = m.cantidad <= m.stock_minimo && m.stock_minimo > 0;
              return (
                <div key={m.id}
                  className={`card-modern animate-slide-in-up p-4 ${isLow ? 'bg-amber-50/50' : 'bg-white'}`}
                  style={{ animationDelay: `${Math.min(idx, 8) * 0.05}s`, opacity: 0 }}>
                  <div className="mb-2 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#1a365d]">{m.nombre}</p>
                      <p className="font-mono text-xs text-gray-400">{m.codigo ?? '-'}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => openEditModal(m)} className="rounded-md p-1.5 text-gray-400 hover:bg-[#1a365d]/10 hover:text-[#1a365d]">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => { setDeletingMaterial(m); setIsDeleteModalOpen(true); }}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {m.categorias_material?.nombre ?? 'Sin cat.'}
                    </span>
                    <span className="text-xs font-medium text-gray-500">{formatMXN(m.precio_unitario)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                    <div className="flex items-center gap-1.5">
                      {isLow && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      <span className={`text-lg font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                        {m.cantidad}
                      </span>
                      <span className="text-xs text-gray-400">{m.unidad}</span>
                    </div>
                    {isLow && <span className="badge-warning rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm">Stock bajo</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="card-modern hidden overflow-x-auto bg-white md:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Código', 'Nombre', 'Categoría', 'Cantidad', 'Unidad', 'Precio', 'Stock Min.', ''].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMaterials.map((m) => {
                  const isLow = m.cantidad <= m.stock_minimo && m.stock_minimo > 0;
                  return (
                    <tr key={m.id} className={`transition-colors ${isLow ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-600">{m.codigo ?? '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-1.5">
                          {m.nombre}
                          {isLow && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{m.categorias_material?.nombre ?? '-'}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-sm font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{m.cantidad}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{m.unidad}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{formatMXN(m.precio_unitario)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{m.stock_minimo}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditModal(m)} className="rounded-md p-1.5 text-gray-400 hover:bg-[#1a365d]/10 hover:text-[#1a365d]"><Edit2 size={15} /></button>
                          <button onClick={() => { setDeletingMaterial(m); setIsDeleteModalOpen(true); }} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modals */}
      <Modal isOpen={isAddModalOpen} onClose={resetAndCloseModals} title="Agregar Material" size="lg">
        {renderForm(handleAdd)}
      </Modal>
      <Modal isOpen={isEditModalOpen} onClose={resetAndCloseModals} title="Editar Material" size="lg">
        {renderForm(handleEdit)}
      </Modal>
      <Modal isOpen={isDeleteModalOpen} onClose={resetAndCloseModals} title="Eliminar Material" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            ¿Eliminar <span className="font-semibold text-gray-900">{deletingMaterial?.nombre}</span>? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={resetAndCloseModals} className="btn-secondary rounded-lg px-4 py-2.5 text-sm font-medium">Cancelar</button>
            <button onClick={handleDelete} disabled={saving} className="btn-danger rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50">
              {saving ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Registrar Factura Modal */}
      <Modal isOpen={isFacturaModalOpen} onClose={() => setIsFacturaModalOpen(false)} title="Registrar Factura" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">No. Factura <span className="text-red-500">*</span></label>
              <input type="text" value={facturaNumero} onChange={(e) => setFacturaNumero(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
                placeholder="Ej. FACT-001" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Proveedor</label>
              <select value={facturaProveedor} onChange={(e) => setFacturaProveedor(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]">
                <option value="">Seleccionar...</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fecha</label>
              <input type="date" value={facturaFecha} onChange={(e) => setFacturaFecha(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Archivo (PDF/Imagen)</label>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFacturaFile(e.target.files?.[0] || null)}
                className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 transition-colors hover:border-[#D4A520] hover:text-[#D4A520]">
                <Upload size={16} />
                {facturaFile ? facturaFile.name : 'Subir archivo'}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
            <input type="text" value={facturaNotas} onChange={(e) => setFacturaNotas(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              placeholder="Observaciones..." />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1a365d]">Materiales a descontar</h3>
              <button type="button" onClick={addFacturaItem}
                className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200">
                <Plus size={14} /> Agregar
              </button>
            </div>

            <div className="space-y-2">
              {facturaItems.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-gray-500">Material</label>
                    <select value={item.material_id} onChange={(e) => updateFacturaItem(idx, 'material_id', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-[#1a365d] focus:outline-none">
                      <option value="">Seleccionar...</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.codigo ? `[${m.codigo}] ` : ''}{m.nombre} (Stock: {m.cantidad})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-24">
                      <label className="mb-1 block text-xs text-gray-500">Cantidad</label>
                      <input type="number" min={0} step="any" value={item.cantidad}
                        onChange={(e) => updateFacturaItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-[#1a365d] focus:outline-none" />
                    </div>
                    <div className="w-28">
                      <label className="mb-1 block text-xs text-gray-500">Precio Unit.</label>
                      <input type="number" min={0} step="any" value={item.precio_unitario}
                        onChange={(e) => updateFacturaItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-[#1a365d] focus:outline-none" />
                    </div>
                    <div className="flex items-end">
                      <button type="button" onClick={() => removeFacturaItem(idx)} disabled={facturaItems.length === 1}
                        className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm text-gray-600">Total: </span>
              <span className="text-lg font-bold text-[#1a365d]">
                {formatMXN(facturaItems.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0))}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button onClick={() => setIsFacturaModalOpen(false)}
              className="btn-secondary rounded-lg px-4 py-2.5 text-sm font-medium">
              Cancelar
            </button>
            <button onClick={handleSaveFactura} disabled={saving}
              className="btn-gold flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold disabled:opacity-50">
              <FileUp size={16} />
              {saving ? 'Guardando...' : 'Registrar y Descontar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Facturas List Modal */}
      <Modal isOpen={isFacturasListOpen} onClose={() => setIsFacturasListOpen(false)} title="Facturas Registradas" size="lg">
        <div className="space-y-3">
          {facturas.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No hay facturas registradas</p>
          ) : (
            facturas.map((f) => (
              <div key={f.id} className="card-hover rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#1a365d]">{f.numero_factura}</p>
                    <p className="text-xs text-gray-500">{f.proveedores?.nombre ?? 'Sin proveedor'}</p>
                    <p className="text-xs text-gray-400">{new Date(f.fecha).toLocaleDateString('es-MX')}</p>
                  </div>
                  {f.archivo_url && (
                    <a href={f.archivo_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg bg-[#1a365d]/10 px-3 py-1.5 text-xs font-medium text-[#1a365d] hover:bg-[#1a365d]/20">
                      <Eye size={14} /> Ver archivo
                    </a>
                  )}
                </div>
                {f.notas && <p className="mt-1 text-xs text-gray-400">{f.notas}</p>}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
