# 🌟 FARO Balance — Administrador Financiero Web

**Proyecto Académico:** Administrador Financiero Personal y de Negocio  
**Estudiante:** Luz Delmar Carrero  
**Aplicación en Producción:** [https://faro-balance.onrender.com](https://faro-balance.onrender.com)  
**Repositorio Oficial:** [https://github.com/luzcarrero15/balance](https://github.com/luzcarrero15/balance)  
**Base de Datos en la Nube:** Neon PostgreSQL (AWS us-east-1)

---

## 📋 Cumplimiento de los 11 Requisitos Académicos del Proyecto

| # | Requisito Académico | Estado | Implementación y Verificación |
| :---: | :--- | :---: | :--- |
| **1** | **Registro de ingresos y gastos** | ✅ Cumplido | Formularios validados para montos, categorías, fechas y descripciones. Admite cantidades sin límite de dígitos con máscaras dinámicas. |
| **2** | **Cálculo de totales diarios, semanales y mensuales** | ✅ Cumplido | Consultas optimizadas con funciones de agregación (`SUM`, `DATE_TRUNC`) para períodos hoy, semana actual y mes calendario actual. |
| **3** | **Cálculo de balances diarios, semanales y mensuales** | ✅ Cumplido | Fórmula contable estricta: `Balance = Ingresos - Gastos`. Indicadores dinámicos de **Superávit** (positivo) y **Déficit** (negativo). |
| **4** | **Operaciones CRUD completas** | ✅ Cumplido | Crear, Leer, Editar y Eliminar tanto para ingresos como gastos, con recálculo instantáneo de balances. |
| **5** | **Interfaz web con logotipo** | ✅ Cumplido | Diseño exclusivo institucional **FARO Balance** (Paleta 1: Verde Esmeralda `#2D6B50` y Vinotinto `#7B1E34`) con logotipo SVG y PNG de alta resolución. |
| **6** | **Base de datos PostgreSQL** | ✅ Cumplido | Esquema normalizado con tablas `usuarios`, `categorias`, `movimientos` y `recuperaciones_password`, llaves foráneas e integridad referencial. |
| **7** | **Cifrado de contraseñas con Argon2i** | ✅ Cumplido | Algoritmo estricto **Argon2i** (`$argon2i$v=19$m=65536,t=3,p=1$`). Nunca se almacenan contraseñas en texto plano. |
| **8** | **PostgreSQL en la nube** | ✅ Cumplido | Instancia administrada en **Neon.tech** (PostgreSQL 16 en AWS us-east-1 con cifrado SSL obligatorio). |
| **9** | **Credenciales de PostgreSQL para el evaluador** | ✅ Cumplido | Rol dedicado e independiente `profesor_evaluador` con permisos de solo lectura (`SELECT`) para auditoría externa sin exponer credenciales maestras. |
| **10** | **Despliegue en la nube gratuita** | ✅ Cumplido | Desplegado como Web Service en **Render.com** con integración y compilación continua desde GitHub. |
| **11** | **Dominio público gratuito y seguro** | ✅ Cumplido | Accesible públicamente con certificado SSL/TLS en [https://faro-balance.onrender.com](https://faro-balance.onrender.com). |

---

## 🔑 Ficha Técnica para el Profesor Evaluador

### 1. Acceso a la Aplicación Web
* **URL Pública:** [https://faro-balance.onrender.com](https://faro-balance.onrender.com)
* **Credenciales de prueba para evaluación:**
  * **Correo:** `luzdelmar1504@gmail.com` (o registrar un usuario nuevo directamente en el formulario).
  * También se puede crear cualquier cuenta de prueba nueva para verificar el aislamiento de datos por usuario.

---

### 2. Acceso a la Base de Datos PostgreSQL (DBeaver / DataGrip / psql)
Para calificar los requisitos de base de datos sin restricciones de red, utilice la siguiente conexión:

| Parámetro | Valor de Conexión |
| :--- | :--- |
| **Motor** | PostgreSQL 16 |
| **Host / Servidor** | `ep-long-union-bcjxbo4w.c-16.us-east-1.aws.neon.tech` |
| **Puerto** | `5432` |
| **Base de Datos** | `neondb` |
| **Usuario Evaluador** | `profesor_evaluador` |
| **Contraseña** | *(Entregada por la estudiante en la ficha física o privada de evaluación)* |
| **Modo SSL** | `require` (Obligatorio) |
| **Nivel de Permisos** | **Solo Lectura (`SELECT`)** sobre todo el esquema `public` |

#### Consulta para comprobar el hash Argon2i:
```sql
SELECT id, nombre, email, LEFT(password_hash, 25) AS algoritmo, creado_en 
FROM public.usuarios;
```
*El resultado mostrará el prefijo `$argon2i$v=19$...`, confirmando el cumplimiento del algoritmo exacto solicitado.*

---

## 🚀 Mejoras y Funcionalidades de Valor Agregado

1. **Exportación Avanzada a Excel Multihoja (`.xlsx`):**
   * **Hoja 1 (Resumen Financiero):** Isotipo institucional, encabezados ejecutivos, ficha de metadatos, tabla de balances diarios, semanales, mensuales e históricos con fórmulas nativas de Excel y notas de auditoría.
   * **Hoja 2 (Movimientos):** Fila superior congelada, autofiltros en todas las columnas, formatos numéricos reales de moneda (`$ #,##0.00`), zebra striping y filas de totales automáticos (`=SUMIF(...)`).
   * **Respeto de Filtros:** Se adapta automáticamente al ámbito activo (**Todo**, **Personal** o **Negocio**), tipo o búsqueda.
2. **Recuperación Segura de Contraseña:**
   * Enlace temporal seguro con caducidad de 1 hora y uso único.
   * Almacenamiento de tokens en hash SHA-256 (nunca texto plano).
   * Integración con servicio transaccional Resend.
   * Las nuevas contraseñas se almacenan con el mismo estándar Argon2i.
3. **Compatibilidad Internacional (i18n / L10n):**
   * Selector regional para 10 países y monedas (Colombia COP, Estados Unidos USD, España EUR, México MXN, Perú PEN, Argentina ARS, Chile CLP, Ecuador USD, Reino Unido GBP, Panamá USD).
   * Separadores de miles, decimales y formatos de fecha adaptables dinámicamente.
4. **Visibilidad de Contraseñas:**
   * Controles de visualización (mostrar/ocultar con icono interactivo) en todos los campos de contraseña.

---

## 🛠️ Tecnologías Utilizadas

* **Backend:** Node.js, Express.js
* **Cifrado y Seguridad:** `argon2` (variante Argon2i), `cookie-parser` con firmas criptográficas
* **Base de Datos:** PostgreSQL 16 (Neon Serverless AWS)
* **Reportes:** `exceljs`
* **Correos Transaccionales:** API de Resend
* **Frontend:** HTML5 semántico, CSS3 corporativo (sin frameworks pesados), JavaScript Vanilla modular
* **Despliegue y CI/CD:** Render Cloud Platform & GitHub

---

## 💻 Instrucciones para Ejecución Local

Si se desea ejecutar el proyecto en un entorno local:

```bash
# 1. Clonar el repositorio
git clone https://github.com/luzcarrero15/balance.git
cd balance

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno (.env)
# DATABASE_URL=postgresql://usuario:password@host/neondb?sslmode=require
# SESSION_SECRET=tu_secreto_de_sesion
# RESEND_API_KEY=tu_api_key

# 4. Iniciar el servidor
npm start
```
Abrir el navegador en `http://localhost:3000`.
