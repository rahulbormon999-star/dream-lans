// interpret.js ইতিমধ্যে Upstash Redis এ প্রতিদিনের search/token/visitor সংখ্যা জমা করছে।
// এই ফাইলটা সেই ডেটা পড়ে admin panel এর গ্রাফের জন্য ফরম্যাট করে দেয়।

function dateKeyDaysAgo(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function getUsageStats(days = 14) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return { available: false, daily: [], totals: { searches: 0, tokens: 0, visitors: 0 } };
  }

  const dateKeys = [];
  for (let i = days - 1; i >= 0; i--) dateKeys.push(dateKeyDaysAgo(i));

  // প্রতিটা দিনের জন্য searches/tokens/visitors একসাথে একটা pipeline রিকোয়েস্টে আনা হচ্ছে
  const cmds = [];
  dateKeys.forEach((dk) => {
    cmds.push(['GET', `stats:searches:daily:${dk}`]);
    cmds.push(['GET', `stats:tokens:daily:${dk}`]);
    cmds.push(['PFCOUNT', `stats:visitors:daily:${dk}`]);
  });
  cmds.push(['GET', 'stats:searches:total']);
  cmds.push(['GET', 'stats:tokens:total']);
  cmds.push(['PFCOUNT', 'stats:visitors:total']);

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds)
    });

    if (!res.ok) return { available: false, daily: [], totals: { searches: 0, tokens: 0, visitors: 0 } };

    const results = await res.json();

    const daily = dateKeys.map((dk, i) => ({
      date: dk,
      searches: Number(results[i * 3]?.result || 0),
      tokens: Number(results[i * 3 + 1]?.result || 0),
      visitors: Number(results[i * 3 + 2]?.result || 0)
    }));

    const totalOffset = days * 3;
    const totals = {
      searches: Number(results[totalOffset]?.result || 0),
      tokens: Number(results[totalOffset + 1]?.result || 0),
      visitors: Number(results[totalOffset + 2]?.result || 0)
    };

    return { available: true, daily, totals };
  } catch (err) {
    console.error('Upstash stats read error:', err);
    return { available: false, daily: [], totals: { searches: 0, tokens: 0, visitors: 0 } };
  }
    }
