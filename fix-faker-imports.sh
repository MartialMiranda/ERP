#!/bin/sh
# Script para corregir las importaciones de faker en los archivos de seeds

# Directorio de seeds
SEEDS_DIR="./src/infrastructure/database/seeds"

# Reemplazar las importaciones en todos los archivos de seeds
find $SEEDS_DIR -name "*.js" -type f -exec sed -i 's/const { faker } = require(\x27@faker-js\/faker\/locale\/es\x27);/const { faker } = require(\x27@faker-js\/faker\x27);\nfaker.setLocale(\x27es\x27);/g' {} \;

echo "Importaciones de faker corregidas en los archivos de seeds."
