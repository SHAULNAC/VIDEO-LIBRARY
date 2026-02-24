const SB_URL = 'https://fbzewdfubjfhqvlusyrj.supabase.co';
const SB_KEY = 'sb_publishable_2JftgVsArBG2NB-RXp0q4Q_jdd8VfPO';
const client = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let userFavorites = [];
let debounceTimeout = null;
let player = null;
let isPlayerReady = false;

// אתחול האפליקציה
async function init() {
    const { data: { user } } = await client.auth.getUser();
    currentUser = user;
    updateUserUI();
    
    if (user) {
        // טעינת מועדפים מראש לצביעת לבבות
        const { data: favs } = await client.from('favorites').select('video_id').eq('user_id', user.id);
        userFavorites = favs ? favs.map(f => f.video_id) : [];
        loadSidebarLists();
    }
    
    fetchVideos(); // טעינה ראשונית של הגלריה
}

function updateUserUI() {
    const userDiv = document.getElementById('user-profile');
    if (currentUser && userDiv) {
        userDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${currentUser.user_metadata.avatar_url}" style="width:35px; border-radius:50%; border: 2px solid #1DB954;">
                <div style="display:flex; flex-direction:column;">
                    <span style="font-size:14px; font-weight:bold;">${currentUser.user_metadata.full_name}</span>
                    <span onclick="logout()" style="color:#b3b3b3; font-size:11px; cursor:pointer; text-decoration:underline;">התנתק</span>
                </div>
            </div>
        `;
    }
}

async function login() { await client.auth.signInWithOAuth({ provider: 'google' }); }
async function logout() { await client.auth.signOut(); window.location.reload(); }

// --- לוגיקת חיפוש וטעינה (FTS + תרגום) ---

async function fetchVideos(query = "") {
    const searchQuery = query.trim();
    if (!searchQuery) {
        const { data } = await client.from('videos').select('*').order('published_at', { ascending: false });
        renderVideoGrid(data);
        return;
    }

    // שלב 1: חיפוש FTS מיידי בעברית/מקור
    await executeSearch(searchQuery);

    // שלב 2: תרגום וחיפוש נוסף באנגלית (Debounce)
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
        const translated = await getTranslation(searchQuery);
        if (translated && translated.toLowerCase() !== searchQuery.toLowerCase()) {
            const { data: translatedData } = await client.rpc('search_videos_prioritized', { search_term: translated });
            if (translatedData && translatedData.length > 0) {
                renderVideoGrid(translatedData, true); // true = שרשור תוצאות
            }
        }
    }, 800);
}

async function executeSearch(finalQuery) {
    const cleanQuery = finalQuery.replace(/[!@#$%^&*(),.?":{}|<>]/g, '').trim();
    if (!cleanQuery) return;

    const { data, error } = await client.rpc('search_videos_prioritized', { search_term: cleanQuery });

    if (error) {
        console.error("Search Error:", error.message);
        // Fallback ל-ILIKE במקרה של תקלה ב-FTS
        const { data: fallbackData } = await client.from('videos').select('*').ilike('title', `%${cleanQuery}%`).limit(20);
        renderVideoGrid(fallbackData || []);
    } else {
        renderVideoGrid(data || []);
    }
}

async function getTranslation(text) {
    const cleanText = text.trim().toLowerCase();
    const { data: cacheEntry } = await client.from('translation_cache').select('translated_text').eq('original_text', cleanText).maybeSingle();
    if (cacheEntry) return cacheEntry.translated_text;

    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=iw&tl=en&dt=t&q=${encodeURI(cleanText)}`);
        const data = await res.json();
        const translated = data[0][0][0];
        if (translated) {
            await client.from('translation_cache').insert([{ original_text: cleanText, translated_text: translated.toLowerCase() }]);
            return translated;
        }
    } catch (e) { console.error("Translation error:", e); }
    return null;
}

// --- רינדור הגלריה ---

function renderVideoGrid(data, append = false) {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    
    if (!data || data.length === 0) {
        if (!append) grid.innerHTML = '<p style="padding:20px; text-align:center; color: #b3b3b3;">לא נמצאו סרטונים...</p>';
        return;
    }

    const html = data.map(v => {
        const isFav = userFavorites.includes(v.id);
        const safeTitle = (v.title || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeChannel = (v.channel_title || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeDesc = (v.description || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <div class="v-card" onclick="playVideo('${v.id}', '${safeTitle}', '${safeChannel}')">
                <div class="card-img-container">
                    <img src="${v.thumbnail || ''}" loading="lazy">
                    <div class="video-description-overlay">${safeDesc}</div>
                    <button class="play-overlay-btn"><i class="fa-solid fa-play"></i></button>
                </div>
                <h3>${v.title}</h3>
                <div class="card-footer">
                    <span>${v.channel_title}</span>
                    <button class="fav-btn" onclick="event.stopPropagation(); toggleFavorite('${v.id}')">
                        <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart" id="fav-icon-${v.id}" ${isFav ? 'style="color: #1DB954;"' : ''}></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (append) {
        grid.innerHTML += html; // הוספה לקיים (לתוצאות תרגום)
    } else {
        grid.innerHTML = html;
    }
}

// --- ניהול הנגן (YouTube API + Fallback) ---

function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtubePlayer', {
        height: '100%',
        width: '100%',
        playerVars: { 'autoplay': 1, 'controls': 1, 'rel': 0, 'enablejsapi': 1, 'origin': window.location.origin },
        events: {
            'onReady': () => { isPlayerReady = true; },
            'onStateChange': (event) => {
                const icon = document.getElementById('play-icon');
                if (event.data === YT.PlayerState.PLAYING) icon.classList.replace('fa-play', 'fa-pause');
                else icon.classList.replace('fa-pause', 'fa-play');
            }
        }
    });
}

async function playVideo(id, title, channel) {
    const playerDiv = document.getElementById('floating-player');
    playerDiv.style.display = 'block';

    // ניסיון נגינה דרך ה-API, אם נכשל (חסימת סינון/דפדפן) עוברים לטעינת SRC ישירה
    if (isPlayerReady && player && typeof player.loadVideoById === 'function') {
        player.loadVideoById(id);
    } else {
        const iframeContainer = document.getElementById('youtubePlayer');
        iframeContainer.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    }

    document.getElementById('current-title').innerText = title;
    document.getElementById('current-channel').innerText = channel;

    // משיכת פרטים נוספים ורישום היסטוריה
    const { data } = await client.from('videos').select('*').eq('id', id).single();
    if (data) {
        document.getElementById('bottom-description').innerText = data.description || "";
        document.getElementById('video-duration').innerText = data.duration || "00:00";
    }

    if (currentUser) {
        await client.from('history').upsert({ user_id: currentUser.id, video_id: id, created_at: new Date() });
        loadSidebarLists();
    }
}

function togglePlayPause() {
    if (!isPlayerReady || !player) return;
    if (player.getPlayerState() === 1) player.pauseVideo();
    else player.playVideo();
}

// --- מועדפים והיסטוריה ---

async function toggleFavorite(videoId) {
    if (!currentUser) return alert("עליך להתחבר");
    const icon = document.getElementById(`fav-icon-${videoId}`);
    const isCurrentlyFav = userFavorites.includes(videoId);

    if (isCurrentlyFav) {
        await client.from('favorites').delete().eq('user_id', currentUser.id).eq('video_id', videoId);
        userFavorites = userFavorites.filter(id => id !== videoId);
        if (icon) { icon.classList.replace('fa-solid', 'fa-regular'); icon.style.color = 'inherit'; }
    } else {
        await client.from('favorites').insert([{ user_id: currentUser.id, video_id: videoId }]);
        userFavorites.push(videoId);
        if (icon) { icon.classList.replace('fa-regular', 'fa-solid'); icon.style.color = '#1DB954'; }
    }
    loadSidebarLists();
}

async function loadSidebarLists() {
    if (!currentUser) return;
    
    // טעינת מועדפים
    const { data: favs } = await client.from('favorites').select('video_id, videos(id, title)').eq('user_id', currentUser.id);
    const favList = document.getElementById('favorites-list');
    if (favs && favList) {
        favList.innerHTML = favs.map(f => f.videos ? `
            <div class="nav-link" style="display:flex; justify-content:space-between;">
                <span onclick="playVideo('${f.videos.id}', '${f.videos.title.replace(/'/g, "\\'")}', '')">${f.videos.title}</span>
                <i class="fa-solid fa-xmark" onclick="toggleFavorite('${f.videos.id}')" style="cursor:pointer; opacity:0.5;"></i>
            </div>` : '').join('');
    }

    // טעינת היסטוריה
    const { data: hist } = await client.from('history').select('video_id, videos(id, title)').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(8);
    const histList = document.getElementById('history-list');
    if (hist && histList) {
        histList.innerHTML = hist.map(h => h.videos ? `
            <div class="nav-link" onclick="playVideo('${h.videos.id}', '${h.videos.title.replace(/'/g, "\\'")}', '')">
                <i class="fa-solid fa-clock-rotate-left"></i> ${h.videos.title}
            </div>` : '').join('');
    }
}

// --- גרירה ושינוי גודל ---
const floatingPlayer = document.getElementById('floating-player');
const dragHandle = document.getElementById('drag-handle');

dragHandle.onmousedown = (e) => {
    let rect = floatingPlayer.getBoundingClientRect();
    let shiftX = e.clientX - rect.left;
    let shiftY = e.clientY - rect.top;
    const move = (e) => {
        floatingPlayer.style.left = e.clientX - shiftX + 'px';
        floatingPlayer.style.top = e.clientY - shiftY + 'px';
        floatingPlayer.style.bottom = 'auto';
    };
    document.addEventListener('mousemove', move);
    document.onmouseup = () => document.removeEventListener('mousemove', move);
};

// האזנה לחיפוש
document.getElementById('globalSearch')?.addEventListener('input', (e) => fetchVideos(e.target.value));

init();
