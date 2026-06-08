const fs = require('fs');
const path = require('path');

const dirsToProcess = [
  'app/(portal)',
  'components/portal',
  'components/admin',
  'components/hackathon'
];

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, callback);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.css')) {
      callback(fullPath);
    }
  }
}

let modifiedCount = 0;

for (const d of dirsToProcess) {
  walk(d, (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    content = content.replace(/shadow-\[([^\]]*)#10B981([^\]]*)\]/g, 'shadow-[$1var(--accent)$2]');
    content = content.replace(/ring-\[#10B981\](\/[0-9]+)?/g, 'ring-accent$1');
    content = content.replace(/border-(x-|y-|l-|r-|t-|b-)?\[#10B981\](\/[0-9]+)?/g, 'border-$1accent$2');
    content = content.replace(/accent-\[#10B981\]/g, 'accent-[var(--accent)]');
    content = content.replace(/via-\[#10B981\](\/[0-9]+)?/g, 'via-accent$1');
    content = content.replace(/accentColor="\[#10B981\]"/g, 'accentColor="var(--accent)"');

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      modifiedCount++;
    }
  });
}

console.log('Modified ' + modifiedCount + ' files to remove final #10B981 hardcodings.');
