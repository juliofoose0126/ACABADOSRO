const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DECENAS_ESPECIALES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function convertGroup(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  let result = '';
  const centena = Math.floor(n / 100);
  const resto = n % 100;

  if (centena > 0) result += CENTENAS[centena];

  if (resto > 0) {
    if (centena > 0) result += ' ';
    if (resto < 10) {
      result += UNIDADES[resto];
    } else if (resto < 20) {
      result += DECENAS_ESPECIALES[resto - 10];
    } else if (resto === 20) {
      result += 'VEINTE';
    } else if (resto < 30) {
      result += 'VEINTI' + UNIDADES[resto - 20];
    } else {
      const decena = Math.floor(resto / 10);
      const unidad = resto % 10;
      result += DECENAS[decena];
      if (unidad > 0) result += ' Y ' + UNIDADES[unidad];
    }
  }

  return result;
}

export function numeroALetras(monto: number): string {
  if (monto === 0) return 'CERO PESOS 00/100 M.N.';

  const entero = Math.floor(Math.abs(monto));
  const centavos = Math.round((Math.abs(monto) - entero) * 100);

  let resultado = '';

  if (entero === 0) {
    resultado = 'CERO';
  } else {
    const millones = Math.floor(entero / 1000000);
    const miles = Math.floor((entero % 1000000) / 1000);
    const unidades = entero % 1000;

    if (millones > 0) {
      if (millones === 1) {
        resultado += 'UN MILLÓN';
      } else {
        resultado += convertGroup(millones) + ' MILLONES';
      }
    }

    if (miles > 0) {
      if (resultado) resultado += ' ';
      if (miles === 1) {
        resultado += 'MIL';
      } else {
        resultado += convertGroup(miles) + ' MIL';
      }
    }

    if (unidades > 0) {
      if (resultado) resultado += ' ';
      resultado += convertGroup(unidades);
    }
  }

  const centavosStr = centavos.toString().padStart(2, '0');
  resultado += ` PESOS ${centavosStr}/100 M.N.`;

  return resultado;
}
