const fs = require('fs');

function acceptHead(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const regex = /<<<<<<< HEAD\r?\n([\s\S]*?)=======\r?\n[\s\S]*?>>>>>>> [0-9a-f]+\r?\n?/g;
    content = content.replace(regex, '$1');
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${filePath}`);
  } catch (e) {
    console.log(`Skipped ${filePath}`);
  }
}

acceptHead('app/page.tsx');
acceptHead('components/Navbar.tsx');
acceptHead('components/sections/AboutSection.tsx');
acceptHead('components/sections/FAQSection.tsx');
acceptHead('components/sections/PrizeAndSpeakerSection.tsx');
acceptHead('components/sections/Schedule/Schedule.tsx');
acceptHead('components/sections/Sponsor.tsx');
acceptHead('app/globals.css');
acceptHead('playwright.config.ts');
acceptHead('tests/frontend.spec.ts');
