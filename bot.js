import cron from 'node-cron';
import { createServer } from 'http';

const PEXELS_API_KEY      = process.env.PEXELS_API_KEY;
const IG_USER_ID          = process.env.INSTAGRAM_USER_ID;
const IG_TOKEN            = process.env.INSTAGRAM_ACCESS_TOKEN;
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_ANON_KEY;

function validateConfig() {
  const missing = ['PEXELS_API_KEY','INSTAGRAM_USER_ID','INSTAGRAM_ACCESS_TOKEN','SUPABASE_URL','SUPABASE_ANON_KEY']
    .filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

async function fetchCarPhoto() {
  const page = Math.floor(Math.random() * 5) + 1;
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=luxury+sports+car&per_page=80&page=${page}`,
    { headers: { Authorization: PEXELS_API_KEY } }
  );
  const data = await res.json();
  if (!data.photos?.length) throw new Error('No photos returned from Pexels');
  const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
  return {
    image_url:    photo.src.large2x,
    photographer: photo.photographer,
    alt:          photo.alt || 'Beautiful luxury car',
    photo_id:     String(photo.id)
  };
}

function generateCaption({ alt, photographer }) {
  const intros = [
    '🚗 Pure automotive perfection.',
    '🔥 Built for the road. Designed for dreams.',
    '⚡ Power meets elegance.',
    '🏎️ Speed, style, and soul.',
    '💨 Chase the horizon.',
    '🌟 Engineering at its finest.',
    '🛣️ The open road is calling.',
    '🔑 Your dream. Your drive.',
    '🚀 Zero to breathtaking.',
    '🎯 Performance redefined.'
  ];
  const hashtags = [
    '#Cars','#CarLovers','#Automotive','#CarPhotography',
    '#CarCulture','#SportsCar','#LuxuryCar','#CarLife',
    '#Carsofinstagram','#CarEnthusiast','#DreamCar',
    '#CarGram','#CarWorld','#AutoLovers','#Horsepower',
    '#CarDesign','#ExoticCars','#CarArt','#MotorSport',
    '#DrivingEmotion','#FastCars','#CarPassion','#AutoGram'
  ];
  const intro    = intros[Math.floor(Math.random() * intros.length)];
  const shuffled = [...hashtags].sort(() => 0.5 - Math.random()).slice(0, 12);
  return `${intro}\n\n${alt}\n\n📸 Photo by ${photographer} on Pexels\n\n${shuffled.join(' ')}`;
}

async function createMediaContainer(image_url, caption) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${IG_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ image_url, caption })
  });
  const data = await res.json();
  if (data.error) throw new Error(`IG container error: ${data.error.message}`);
  return data.id;
}

async function publishMedia(creation_id) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${IG_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ creation_id })
  });
  const data = await res.json();
  if (data.error) throw new Error(`IG publish error: ${data.error.message}`);
  return data.id;
}

async function logToSupabase(image_url, caption, instagram_post_id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
    method:  'POST',
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal'
    },
    body: JSON.stringify({ image_url, caption, instagram_post_id })
  });
  if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);
}

async function runBot() {
  const ts = () => new Date().toISOString();
  console.log(`[${ts()}] Starting bot run...`);
  try {
    const photo      = await fetchCarPhoto();
    console.log(`[${ts()}] Photo fetched: ${photo.photo_id} by ${photo.photographer}`);

    const caption    = generateCaption(photo);
    console.log(`[${ts()}] Caption ready (${caption.length} chars)`);

    const containerId = await createMediaContainer(photo.image_url, caption);
    console.log(`[${ts()}] Container created: ${containerId}`);

    await new Promise(r => setTimeout(r, 10_000));

    const postId     = await publishMedia(containerId);
    console.log(`[${ts()}] Published to Instagram! Post ID: ${postId}`);

    await logToSupabase(photo.image_url, caption, postId);
    console.log(`[${ts()}] Logged to Supabase`);

    console.log(`[${ts()}] Run complete.`);
  } catch (err) {
    console.error(`[${ts()}] ERROR: ${err.message}`);
    process.exitCode = 1;
  }
}

// --- Entry point ---
validateConfig();

if (process.argv.includes('--once')) {
  await runBot();
} else {
  console.log('Instagram Car Bot started. Posts every hour on the hour.');
  cron.schedule('0 * * * *', runBot);

  const PORT = process.env.PORT || 3000;
  createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'running', schedule: 'every hour' }));
  }).listen(PORT, () => console.log(`Health check listening on port ${PORT}`));
}
