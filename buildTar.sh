VERSION="v$(jq .version -r driver.json)"
FILE_NAME="dist/integration-matter-${VERSION}.tar.gz"
FILE_NAME_RESET="dist/integration-matter-reset-${VERSION}.tar.gz"

#api_definitions.js has an "n" character at the start for some reason. This will fix this.
sed -i 's/^n//' node_modules/@unfoldedcircle/integration-api/dist/mjs/lib/api_definitions.js

npm run build
rm -r ./dist/tar
rm ./dist/*.tar.gz
mkdir ./dist/tar
echo $VERSION > ./dist/tar/version.txt
cp driver.json ./dist/tar/
cp matter.png ./dist/tar/
npx esbuild src/driver.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile=dist/tar/bin/driver.js \
  --main-fields=module,main \
  --external:supports-color \
  --external:debug \
  --external:bonjour-service \
  --external:ws \
  --external:ioredis \
  --external:valkeyrie \
  --external:./src/storage/redis-storage.ts \
  --external:./src/storage/valkeyrie-storage.ts
npm install supports-color debug bonjour-service ws --omit=dev --prefix ./dist/tar/bin
rm ./dist/tar/bin/package.json
rm ./dist/tar/bin/package-lock.json
tar -C ./dist/tar -czvf ${FILE_NAME} ./
mkdir ./dist/tar/config
touch ./dist/tar/config/reset
tar -C ./dist/tar -czvf ${FILE_NAME_RESET} ./