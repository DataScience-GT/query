const fs = require('fs');
const path = require('path');

const packagesToRestore = [
  "@query/api", "@query/auth", "@query/db", "@query/ui",
  "@query/eslint-config", "@query/prettier-config", "@query/tailwind-config", "@query/tsconfig"
];

function restore(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.includes('node_modules') && !entry.name.includes('.next')) {
        restore(fullPath);
      }
    } else if (entry.name === 'package.json') {
      try {
        const fd = fs.openSync(fullPath, 'r+');
        const content = fs.readFileSync(fd, 'utf8');
        const json = JSON.parse(content);
        let changed = false;

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
          const output = JSON.stringify(json, null, 2) + '\n';
          fs.ftruncateSync(fd);
          fs.writeSync(fd, output, 0);
          console.log('Restored workspace:* in ' + fullPath);
        }
        fs.closeSync(fd);
      } catch (e) {
        console.error('Error processing ' + fullPath + ': ' + e.message);
      }
    }
  }
}

restore(process.cwd());
