const https = require('https');

const token = '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';
const pageId = '2aac5c7f-72ad-80bf-a0f9-c66c9626abfb';

function getChildren(id) {
  return new Promise(resolve => {
    https.get({
      hostname: 'api.notion.com',
      path: '/v1/blocks/' + id + '/children',
      headers: {
        Authorization: 'Bearer ' + token,
        'Notion-Version': '2022-06-28'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data).results));
    });
  });
}

async function printCheckIn(id) {
  const children = await getChildren(id);
  let inCheckIn = false;
  for (let i = 0; i < children.length; i++) {
    const b = children[i];
    const text = (b[b.type]?.rich_text || []).map(x => x.plain_text).join('');
    if (b.type === 'heading_1' && text.includes('Check In')) {
      inCheckIn = true;
      console.log('??? ' + text);
      continue;
    }
    if (inCheckIn) {
      if (b.type === 'heading_1') break; // stop at next heading_1
      console.log(text);
    }
  }
}

printCheckIn(pageId);
