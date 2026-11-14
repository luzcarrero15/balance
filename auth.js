const argon2 = require('argon2');

/**
 * Cifra una contraseña plana utilizando estrictamente la variante Argon2i.
 * Requisito 7 del profesor: "Proteger las contraseñas con Argon2i"
 * 
 * @param {string} plainPassword 
 * @returns {Promise<string>} hash generado con Argon2i
 */
async function hashPassword(plainPassword) {
  try {
    return await argon2.hash(plainPassword, {
      type: argon2.argon2i,   // Especificación explícita de Argon2i
      memoryCost: 65536,      // 64 MB de memoria
      timeCost: 3,            // 3 iteraciones
      parallelism: 1          // 1 hilo
    });
  } catch (error) {
    console.error('Error al cifrar con Argon2i:', error);
    throw new Error('Error de seguridad al procesar la contraseña');
  }
}

/**
 * Verifica si una contraseña plana coincide con el hash almacenado en la base de datos.
 * 
 * @param {string} hash 
 * @param {string} plainPassword 
 * @returns {Promise<boolean>}
 */
async function verifyPassword(hash, plainPassword) {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch (error) {
    console.error('Error al verificar hash con Argon2i:', error);
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword
};
