const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchRedditPosts(name, type) {
  const url = type === 'subreddit'
    ? `https://www.reddit.com/r/${name}/new.json?limit=10&raw_json=1`
    : `https://www.reddit.com/user/${name}/submitted.json?sort=new&limit=10&raw_json=1`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });

  if (res.status === 429) throw new Error('Reddit rate limited — will retry next cycle');
  if (!res.ok) throw new Error(`Reddit ${res.status}: ${res.statusText}`);

  const json = await res.json();
  const children = json?.data?.children || [];

  return children.map(c => {
    const d = c.data;
    // Pick best image: preview > thumbnail > null
    let image = null;
    if (d.preview?.images?.[0]?.source?.url) {
      image = d.preview.images[0].source.url;
    } else if (d.thumbnail && d.thumbnail.startsWith('http')) {
      image = d.thumbnail;
    }

    return {
      id: d.name,
      title: d.title || '',
      text: d.selftext || '',
      url: `https://reddit.com${d.permalink}`,
      subreddit: d.subreddit_name_prefixed || '',
      author: d.author || '',
      score: d.score || 0,
      numComments: d.num_comments || 0,
      flair: d.link_flair_text || '',
      image,
      isVideo: d.is_video || false,
      domain: d.domain || '',
      date: new Date(d.created_utc * 1000).toISOString(),
    };
  });
}

module.exports = { fetchRedditPosts };
