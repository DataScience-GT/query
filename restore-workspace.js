const fs = require('fs');
const path = require('path');

const packagesToRestore = [
  "@query/api", "@query/auth", "@query/db", "@query/ui",
  "@query/eslint-config", "@query/prettier-config", "@query/tailwind-config", "@query/tsconfig"
];

function restore(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('.next')) {
        restore(fullPath);
      }
    } else if (file === 'package.json') {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      const json = JSON.parse(content);
      
      for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
        if (json[section]) {
          for (const pkg of packagesToRestore) {
            if (json[section][pkg] === '*') {
              json[section][pkg] = 'workspace:*';
              changed = true;
            }
          }
        }
      }
      if (changed) {
        fs.writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n');
        console.log('Restored workspace:* in ' + fullPath);
      }
    }
  }
}

restore(process.cwd());
