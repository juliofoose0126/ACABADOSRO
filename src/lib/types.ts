export interface Proyecto {
  id: string;
  nombre: string;
  cliente: string | null;
  direccion: string | null;
  descripcion: string | null;
  estado: 'activo' | 'completado' | 'pausado';
  created_by: string | null;
  created_at: string;
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'usuario';
  activo: boolean;
  created_at: string;
}

export interface CategoriaMaterial {
  id: string;
  nombre: string;
  descripcion: string | null;
  created_at: string;
}

export interface Material {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria_id: string | null;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  stock_minimo: number;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
  categorias_material?: CategoriaMaterial;
}

export interface Proveedor {
  id: string;
  nombre: string;
  rfc: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  created_at: string;
}

export interface OrdenCompra {
  id: string;
  numero_orden: string;
  proveedor_id: string | null;
  fecha: string;
  fecha_entrega: string | null;
  estado: 'pendiente' | 'aprobada' | 'recibida' | 'cancelada';
  subtotal: number;
  iva: number;
  total: number;
  notas: string | null;
  obra_proyecto: string | null;
  vendedor: string | null;
  folio_numero: number | null;
  proyecto_id: string | null;
  created_by: string | null;
  created_at: string;
  proveedores?: Proveedor;
}

export interface OrdenDetalle {
  id: string;
  orden_id: string;
  material_id: string | null;
  codigo_item: string | null;
  descripcion_item: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal: number;
  created_at: string;
  materiales?: Material;
}

export type TipoGasto = 'nomina' | 'seguros' | 'materiales' | 'otros';

export interface Gasto {
  id: string;
  categoria: TipoGasto;
  concepto: string;
  monto: number;
  fecha: string;
  mes: number;
  anio: number;
  proveedor: string | null;
  comprobante: string | null;
  notas: string | null;
  proyecto_id: string | null;
  created_by: string | null;
  created_at: string;
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const CATEGORIAS_GASTO: Record<TipoGasto, string> = {
  nomina: 'Nóminas',
  seguros: 'Legales',
  materiales: 'Materiales',
  otros: 'Otros Gastos',
};
