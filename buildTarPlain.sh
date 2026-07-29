VERSION="v$(jq .version -r driver.json)"
FILE_NAME="dist/integration-matter-${VERSION}.tar.gz"
FILE_NAME_RESET="dist/integration-matter-reset-${VERSION}.tar.gz"

npm run build
rm -r ./dist/tar
rm ./dist/*.tar.gz
mkdir ./dist/tar
mkdir ./dist/tar/bin
echo $VERSION > ./dist/tar/version.txt
mkdir ./dist/modules
cp package.json ./dist/modules
cp package-lock.json ./dist/modules
npm install --omit=dev --prefix ./dist/modules
mkdir ./dist/tar/config
touch ./dist/tar/config/init
cp driver.json ./dist/tar/
cp matter.png ./dist/tar/
cp -r ./dist/src/* ./dist/tar/bin
cp -r ./dist/modules/node_modules ./dist/tar/bin/node_modules
tar -C ./dist/tar -czvf ${FILE_NAME} ./
touch ./dist/tar/config/reset
tar -C ./dist/tar -czvf ${FILE_NAME_RESET} ./