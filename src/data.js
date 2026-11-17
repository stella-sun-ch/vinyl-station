
export const ARTISTS = [
  { id: 'balu-brigada', artist: 'Balu Brigada', album: 'Portal', track: 'Backseat', albumId: 1816613278, trackId: 1816613284, colour: '#e4572e' },  
  { id: 'mac-miller', artist: 'Mac Miller', album: 'I Love Life, Thank You', track: 'Love Lost', albumId: 1845378528, trackId: 1845378537, colour: '#2a6f97' },
  { id: 'tame-impala', artist: 'Tame Impala', album: 'Currents', track: 'Let It Happen', colour: '#8e5bd6' },
  { id: 'm83', artist: 'M83', album: "Hurry Up, We're Dreaming", track: 'Midnight City', colour: '#1b1f5e' },  
  { id: 'artemas', artist: 'Artemas', album: 'yustyna', colour: '#19191c' },
  { id: 'modjo', artist: 'Modjo', album: 'Modjo', track: 'Lady (Hear Me Tonight)', colour: '#d6a45a' },
  { id: 'the-xx', artist: 'The xx', album: 'xx', colour: '#f4f1ea' },
  { id: 'the-killers', artist: 'The Killers', album: 'Hot Fuss', colour: '#c1272d' },
  { id: 'unknown-mortal-orchestra', artist: 'Unknown Mortal Orchestra', album: 'Multi-Love', track: 'Multi-Love', colour: '#d5a46c' },
  { id: 'toploader', artist: 'Toploader', album: "Onka's Big Moka", track: 'Dancing in the Moonlight', colour: '#e9bd64' },
  { id: 'madonna', artist: 'Madonna', album: 'True Blue', track: 'La Isla Bonita', colour: '#e4b18d' },
  { id: 'pawsa', artist: 'PAWSA', album: 'Too Cool To Be Careless', track: 'Too Cool To Be Careless', colour: '#c5a77c' },
  { id: 'mgmt', artist: 'MGMT', album: 'Oracular Spectacular', colour: '#3fa56b' },
  { id: 'elo', artist: 'Electric Light Orchestra', album: 'Out of the Blue', track: 'Mr. Blue Sky', colour: '#4c87bc' },
  { id: 'bronski-beat', artist: 'Bronski Beat', album: 'The Age of Consent', track: 'Smalltown Boy', colour: '#496a91' },
  { id: 'ladji-mouflet', artist: 'Ladji Mouflet', album: 'Missing in Action (The Return)', track: "Don't U Know?", colour: '#a6a4bb' },
  { id: 'kylie-minogue', artist: 'Kylie Minogue', album: 'Fever', track: 'In Your Eyes', colour: '#a7bcd5' },
  { id: 'black-coffee-rapture', artist: '&ME & Black Coffee', album: 'The Rapture Pt.III', track: 'The Rapture Pt.III', colour: '#5c5970' },
  { id: 'mika', artist: 'MIKA', album: 'Life In Cartoon Motion', track: 'Relax, Take It Easy', colour: '#e8b15e' },

];

const CACHE_KEY = 'vinyl-station:library:v1';
const CACHE_DAYS = 7;
const SEARCH_URL = 'https://itunes.apple.com/search';

const same = (a, b) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function normalize(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));

    if (
      !cached ||
      Date.now() - cached.savedAt > CACHE_DAYS * 24 * 60 * 60 * 1000
    ) {
      return {};
    }

    return cached.items ?? {};
  } catch {
    return {};
  }
}

function writeCache(items) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), items })
    );
  } catch {
    // The player still works if browser storage is unavailable.
  }
}

// Selects the requested song, not a random album track.
function pickSong(results, { artist, album, track, trackId }) {
  const playable = results.filter(
    (r) => r.kind === 'song' && r.previewUrl
  );

  // Exact Apple track ID takes priority.
  if (trackId) {
    return playable.find(
      (r) => Number(r.trackId) === Number(trackId)
    ) ?? null;
  }

  const artistName = normalize(artist);

  const byArtist = playable.filter(
    (r) => normalize(r.artistName ?? '').includes(artistName)
  );

  const albumName = normalize(album);

  // If a song was specified, select that particular song.
  if (track) {
    const wanted = normalize(track);

    const matches = byArtist.filter((r) => {
      const title = normalize(r.trackName ?? '');

      return title === wanted ||
             title.startsWith(`${wanted} `);
    });

    // Prefer the exact song on the requested album.
    return (
      matches.find(
        (r) =>
          normalize(r.collectionName ?? '').startsWith(albumName) &&
          normalize(r.trackName ?? '') === wanted
      ) ??
      matches.find(
        (r) =>
          normalize(r.collectionName ?? '').startsWith(albumName)
      ) ??
      matches.find(
        (r) => normalize(r.trackName ?? '') === wanted
      ) ??
      matches[0] ??
      null
    );
  }

  // Older records without a chosen track keep their behaviour.
  const onAlbum = byArtist.filter(
    (r) =>
      normalize(r.collectionName ?? '').startsWith(albumName)
  );

  return onAlbum[0] ?? byArtist[0] ?? null;
}

async function searchItunes(entry) {
  const params = new URLSearchParams(
    entry.trackId || entry.albumId
      ? {
          id: entry.trackId ?? entry.albumId,
          entity: 'song',
        }
      : {
          term: `${entry.artist} ${entry.track ?? entry.album}`,
          entity: 'song',
          limit: '50',
        }
  );

  const endpoint = entry.trackId || entry.albumId
    ? 'https://itunes.apple.com/lookup'
    : SEARCH_URL;

  const response = await fetch(`${endpoint}?${params}`);

  if (!response.ok) {
    throw new Error(`iTunes answered ${response.status}`);
  }

  const { results = [] } = await response.json();

  const song = pickSong(results, entry);

  if (!song) {
    throw new Error(
      `No playable preview found for ${entry.artist} - ${entry.track ?? entry.album}`
    );
  }

  return {
    album: song.collectionName,
    track: song.trackName,
    artworkUrl: song.artworkUrl100
      ? song.artworkUrl100.replace('100x100', '600x600')
      : null,
    previewUrl: song.previewUrl ?? null,
    storeUrl: song.trackViewUrl ?? null,
  };
}

export async function loadLibrary() {
  const cache = readCache();

  const entries = await Promise.all(
    ARTISTS.map(async (base) => {

      // Changing artist, album or track refreshes its cache.
      const cacheKey =
        `${base.id}:${base.album}:${base.track ?? ''}:${base.trackId ?? ''}`;

      if (cache[cacheKey]) {
        return {
          ...base,
          ...cache[cacheKey],
          source: 'cache',
          error: null,
        };
      }

      try {
        const found = await searchItunes(base);

        cache[cacheKey] = found;

        return {
          ...base,
          ...found,
          source: 'itunes',
          error: null,
        };
      } catch (error) {
        console.warn(`${base.artist}: ${error.message}`);

        return {
          ...base,
          album: null,
          track: null,
          artworkUrl: null,
          previewUrl: null,
          storeUrl: null,
          source: null,
          error: error.message,
        };
      }
    })
  );

  writeCache(cache);
  return entries;
}
