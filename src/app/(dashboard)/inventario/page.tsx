'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Material, CategoriaMaterial } from '@/lib/types';
import Modal from '@/components/Modal';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Package,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface Toast {
  message: string;
  type: 'success' | 'error';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMXN(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InventarioPage() {
  // Data
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<CategoriaMaterial[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState<Material | null>(null);

  // Form
  const [formData, setFormData] = useState<FormData>(emptyForm);

  // UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // -------------------------------------------------------------------
  // Toast helper
  // -------------------------------------------------------------------

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // -------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categorias_material')
      .select('*')
      .order('nombre');

    if (error) {
      showToast('Error al cargar categorias: ' + error.message, 'error');
      return;
    }
    setCategories(data ?? []);
  }, [showToast]);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('materiales')
      .select('*, categorias_material(nombre)')
      .order('nombre');

    if (error) {
      showToast('Error al cargar materiales: ' + error.message, 'error');
      setLoading(false);
      return;
    }
    setMaterials(data ?? []);
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetchCategories();
    fetchMaterials();
  }, [fetchCategories, fetchMaterials]);

  // -------------------------------------------------------------------
  // Filtered materials
  // -------------------------------------------------------------------

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch =
      searchTerm === '' ||
      m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.codigo ?? '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      selectedCategory === '' || m.categoria_id === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // -------------------------------------------------------------------
  // Form helpers
  // -------------------------------------------------------------------

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === 'cantidad' || name === 'precio_unitario' || name === 'stock_minimo'
          ? Number(value)
          : value,
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

  // -------------------------------------------------------------------
  // CRUD: Add
  // -------------------------------------------------------------------

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      codigo: formData.codigo || null,
      nombre: formData.nombre,
      categoria_id: formData.categoria_id || null,
      unidad: formData.unidad,
      cantidad: formData.cantidad,
      precio_unitario: formData.precio_unitario,
      stock_minimo: formData.stock_minimo,
      descripcion: formData.descripcion || null,
    };

    const { error } = await supabase.from('materiales').insert(payload);
    setSaving(false);

    if (error) {
      showToast('Error al agregar material: ' + error.message, 'error');
      return;
    }

    showToast('Material agregado correctamente', 'success');
    resetAndCloseModals();
    fetchMaterials();
  }

  // -------------------------------------------------------------------
  // CRUD: Edit
  // -------------------------------------------------------------------

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

    const payload = {
      codigo: formData.codigo || null,
      nombre: formData.nombre,
      categoria_id: formData.categoria_id || null,
      unidad: formData.unidad,
      cantidad: formData.cantidad,
      precio_unitario: formData.precio_unitario,
      stock_minimo: formData.stock_minimo,
      descripcion: formData.descripcion || null,
    };

    const { error } = await supabase
      .from('materiales')
      .update(payload)
      .eq('id', editingMaterial.id);
    setSaving(false);

    if (error) {
      showToast('Error al actualizar material: ' + error.message, 'error');
      return;
    }

    showToast('Material actualizado correctamente', 'success');
    resetAndCloseModals();
    fetchMaterials();
  }

  // -------------------------------------------------------------------
  // CRUD: Delete
  // -------------------------------------------------------------------

  function openDeleteModal(material: Material) {
    setDeletingMaterial(material);
    setIsDeleteModalOpen(true);
  }

  async function handleDelete() {
    if (!deletingMaterial) return;
    setSaving(true);

    const { error } = await supabase
      .from('materiales')
      .delete()
      .eq('id', deletingMaterial.id);
    setSaving(false);

    if (error) {
      showToast('Error al eliminar material: ' + error.message, 'error');
      return;
    }

    showToast('Material eliminado correctamente', 'success');
    resetAndCloseModals();
    fetchMaterials();
  }

  // -------------------------------------------------------------------
  // Shared form JSX
  // -------------------------------------------------------------------

  function renderForm(onSubmit: (e: React.FormEvent) => void) {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Row: Codigo + Nombre */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Codigo
            </label>
            <input
              type="text"
              name="codigo"
              value={formData.codigo}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              placeholder="Ej. MAT-001"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              placeholder="Nombre del material"
            />
          </div>
        </div>

        {/* Row: Categoria + Unidad */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Categoria
            </label>
            <select
              name="categoria_id"
              value={formData.categoria_id}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            >
              <option value="">Sin categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Unidad <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="unidad"
              value={formData.unidad}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
              placeholder="Ej. pza, kg, m"
            />
          </div>
        </div>

        {/* Row: Cantidad + Precio + Stock Min */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Cantidad <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="cantidad"
              value={formData.cantidad}
              onChange={handleChange}
              min={0}
              step="0.01"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Precio Unitario <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="precio_unitario"
              value={formData.precio_unitario}
              onChange={handleChange}
              min={0}
              step="0.01"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Stock Minimo
            </label>
            <input
              type="number"
              name="stock_minimo"
              value={formData.stock_minimo}
              onChange={handleChange}
              min={0}
              step="0.01"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            />
          </div>
        </div>

        {/* Descripcion */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Descripcion
          </label>
          <textarea
            name="descripcion"
            value={formData.descripcion}
            onChange={handleChange}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
            placeholder="Descripcion opcional"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={resetAndCloseModals}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#1a365d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f] disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    );
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 top-4 z-[200] rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a365d]">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Gestion de Inventario
            </h1>
            <p className="text-sm text-gray-500">
              {materials.length} materiales registrados
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setFormData(emptyForm);
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1a365d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2a4a7f]"
        >
          <Plus className="h-4 w-4" />
          Agregar Material
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o codigo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d]"
          />
        </div>

        {/* Category filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#1a365d] focus:outline-none focus:ring-1 focus:ring-[#1a365d] sm:w-56"
        >
          <option value="">Todas las categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {[
                'Codigo',
                'Nombre',
                'Categoria',
                'Cantidad',
                'Unidad',
                'Precio Unitario',
                'Stock Min.',
                'Acciones',
              ].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                  Cargando materiales...
                </td>
              </tr>
            ) : filteredMaterials.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                  No se encontraron materiales.
                </td>
              </tr>
            ) : (
              filteredMaterials.map((m) => {
                const isLowStock = m.cantidad <= m.stock_minimo && m.stock_minimo > 0;
                return (
                  <tr
                    key={m.id}
                    className={
                      isLowStock
                        ? 'bg-amber-50 hover:bg-amber-100'
                        : 'hover:bg-gray-50'
                    }
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-700">
                      {m.codigo ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {m.nombre}
                        {isLowStock && (
                          <span title="Stock bajo">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {m.categorias_material?.nombre ?? (
                        <span className="text-gray-400">Sin categoria</span>
                      )}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-sm font-semibold ${
                        isLowStock ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {m.cantidad}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {m.unidad}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {formatMXN(m.precio_unitario)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {m.stock_minimo}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(m)}
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-[#1a365d]/10 hover:text-[#1a365d]"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openDeleteModal(m)}
                          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={resetAndCloseModals}
        title="Agregar Material"
        size="lg"
      >
        {renderForm(handleAdd)}
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={resetAndCloseModals}
        title="Editar Material"
        size="lg"
      >
        {renderForm(handleEdit)}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={resetAndCloseModals}
        title="Eliminar Material"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Estas seguro de que deseas eliminar{' '}
            <span className="font-semibold text-gray-900">
              {deletingMaterial?.nombre}
            </span>
            ? Esta accion no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={resetAndCloseModals}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
