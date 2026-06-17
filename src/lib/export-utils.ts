import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToExcel(
  data: Record<string, unknown>[],
  headers: { key: string; label: string }[],
  filename: string,
  sheetName = 'Datos'
) {
  const wsData = [
    headers.map((h) => h.label),
    ...data.map((row) => headers.map((h) => row[h.key] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const colWidths = headers.map((h) => ({
    wch: Math.max(
      h.label.length,
      ...data.map((row) => String(row[h.key] ?? '').length)
    ) + 2,
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportMultiSheetExcel(
  sheets: { name: string; data: Record<string, unknown>[]; headers: { key: string; label: string }[] }[],
  filename: string
) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const wsData = [
      sheet.headers.map((h) => h.label),
      ...sheet.data.map((row) => sheet.headers.map((h) => row[h.key] ?? '')),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = sheet.headers.map((h) => ({
      wch: Math.max(
        h.label.length,
        ...sheet.data.map((row) => String(row[h.key] ?? '').length),
        10
      ) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportOrdenCompraPDF(orden: {
  numero_orden: string;
  fecha: string;
  fecha_entrega?: string | null;
  proveedor: string;
  contacto?: string;
  telefono?: string;
  notas?: string | null;
  items: { descripcion: string; cantidad: number; unidad: string; precio_unitario: number; subtotal: number }[];
  subtotal: number;
  iva: number;
  total: number;
}) {
  const doc = new jsPDF();

  doc.setFillColor(26, 54, 93);
  doc.rect(0, 0, 210, 45, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('ACABADOS RO', 15, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Tablaroca y Acabados Profesionales', 15, 28);
  doc.text('Tel: (000) 000-0000 | acabadosro@email.com', 15, 34);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('ORDEN DE COMPRA', 140, 20);
  doc.setFontSize(11);
  doc.text(orden.numero_orden, 140, 28);

  doc.setTextColor(0, 0, 0);
  let y = 55;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Proveedor:', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.text(orden.proveedor, 45, y);
  y += 7;

  if (orden.contacto) {
    doc.setFont('helvetica', 'bold');
    doc.text('Contacto:', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.text(orden.contacto, 45, y);
    y += 7;
  }

  if (orden.telefono) {
    doc.setFont('helvetica', 'bold');
    doc.text('Teléfono:', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.text(orden.telefono, 45, y);
    y += 7;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha:', 130, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(orden.fecha, 155, 55);

  if (orden.fecha_entrega) {
    doc.setFont('helvetica', 'bold');
    doc.text('Entrega:', 130, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(orden.fecha_entrega, 155, 62);
  }

  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Descripción', 'Cant.', 'Unidad', 'P. Unitario', 'Subtotal']],
    body: orden.items.map((item, i) => [
      i + 1,
      item.descripcion,
      item.cantidad.toString(),
      item.unidad,
      `$${item.precio_unitario.toFixed(2)}`,
      `$${item.subtotal.toFixed(2)}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [26, 54, 93], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 70 },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { left: 15, right: 15 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 30;
  const totalsY = finalY + 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Subtotal:', 140, totalsY);
  doc.text(`$${orden.subtotal.toFixed(2)}`, 180, totalsY, { align: 'right' });

  doc.text('IVA (16%):', 140, totalsY + 7);
  doc.text(`$${orden.iva.toFixed(2)}`, 180, totalsY + 7, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', 140, totalsY + 16);
  doc.text(`$${orden.total.toFixed(2)}`, 180, totalsY + 16, { align: 'right' });

  if (orden.notas) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Notas:', 15, totalsY);
    doc.text(orden.notas, 15, totalsY + 6, { maxWidth: 110 });
  }

  const pageHeight = doc.internal.pageSize.height;
  doc.setFillColor(26, 54, 93);
  doc.rect(0, pageHeight - 15, 210, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('Acabados RO - Documento generado automáticamente', 105, pageHeight - 6, { align: 'center' });

  doc.save(`Orden_${orden.numero_orden}.pdf`);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
