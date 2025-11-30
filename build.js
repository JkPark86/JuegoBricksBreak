import { copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

async function build() {
  try {
    // Crear carpeta dist si no existe
    if (!existsSync('dist')) {
      await mkdir('dist', { recursive: true });
    }

    // Archivos a copiar
    const filesToCopy = [
      'index.html',
      'juego.html',
      'package.json',
      'vercel.json'
    ];

    // Copiar archivos principales
    for (const file of filesToCopy) {
      if (existsSync(file)) {
        await copyFile(file, join('dist', file));
        console.log(`✓ Copiado: ${file}`);
      }
    }

    // Copiar carpeta public si existe
    if (existsSync('public')) {
      await mkdir(join('dist', 'public'), { recursive: true });
      const publicFiles = ['tierra.png', 'esfera.png', 'ladrillo.png', 'pantalla.png'];
      for (const file of publicFiles) {
        if (existsSync(join('public', file))) {
          await copyFile(join('public', file), join('dist', 'public', file));
          console.log(`✓ Copiado: public/${file}`);
        } else {
          console.log(`⚠ No encontrado: public/${file}`);
        }
      }
    }

    // Copiar carpeta src si existe
    if (existsSync('src')) {
      await mkdir(join('dist', 'src'), { recursive: true });
      if (existsSync(join('src', 'game.js'))) {
        await copyFile(join('src', 'game.js'), join('dist', 'src', 'game.js'));
        console.log('✓ Copiado: src/game.js');
      }
    }

    console.log('✅ Build completado correctamente');
  } catch (error) {
    console.error('❌ Error en build:', error);
    process.exit(1);
  }
}

build();