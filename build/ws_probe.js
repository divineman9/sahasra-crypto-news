const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:4181');
const seen = { snapshot: 0, post: 0, update: 0 };
let votedId = null;
ws.on('message', async (buf) => {
  const m = JSON.parse(buf.toString());
  seen[m.type] = (seen[m.type] || 0) + 1;
  if (m.type === 'snapshot') console.log(`snapshot: ${m.posts.length} posts, newest="${m.posts[0]?.title}"`);
  if (m.type === 'post') {
    console.log(`live post: ${m.post.publishedAt} [${m.post.instruments.map(i=>i.ticker)}] ${m.post.title}`);
    if (!votedId) {
      votedId = m.post.id;
      const r = await fetch(`http://localhost:4180/api/posts/${votedId}/vote`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ type: 'important' }) });
      console.log('vote http', r.status);
    }
  }
  if (m.type === 'update') console.log(`update: ${m.post.id === votedId ? 'SAME post' : 'other'} votes=${JSON.stringify(m.post.votes)}`);
});
setTimeout(() => { console.log('SUMMARY', JSON.stringify(seen)); process.exit(seen.snapshot && seen.post && seen.update ? 0 : 1); }, 13000);
