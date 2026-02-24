const SB_URL = 'https://fbzewdfubjfhqvlusyrj.supabase.co';
const SB_KEY = 'sb_publishable_2JftgVsArBG2NB-RXp0q4Q_jdd8VfPO';
const client = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let userFavorites = [];
let player; 
let isPlayerReady = false;

async function init() {
    const { data: { user } } = await client.auth.getUser();
    currentUser = user;
    updateUserUI();
    
    if (user) {
        const { data: favs } = await client.from('favorites').select('video_id').eq('user_id', user.id);
        userFavorites = favs ? favs.map(f => f.video_id) : [];
        loadSidebarLists();
    }
    
    fetchVideos();
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

async function fetchVideos(query = "") {
    const searchQuery = query.trim();
    if (!searchQuery) {
        const { data } = await client.from('videos').select('*').order('published_at', { ascending: false });
        renderVideoGrid(data);
    } else {
        const { data } = await client.rpc('search_videos_prioritized', { search_term: searchQuery });
        renderVideoGrid(data || []);
    }
}

function renderVideoGrid(data) {
    const grid = document.getElementById('videoGrid');
    if (!grid || !data) return;
    
    grid.innerHTML = data.map(v => {
        const safeTitle = (v.title || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeChannel = (v.channel_title || "").replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const isFav = userFavorites.includes(v.id);
        
        return `
            <div class="v-card" onclick="playVideo('${v.id}', '${safeTitle}', '${safeChannel}')">
                <div class="card-img-container">
                    <img src="${v.thumbnail || ''}" loading="lazy">
                    <div class="video-description-overlay">${(v.description || "").replace(/'/g, "\\'")}</div>
                </div>
                <h3>${v.title}</h3>
                <div class="card-footer">
                    <span>${v.channel_title}</span>
                    <button class="fav-btn" onclick="event.stopPropagation(); toggleFavorite('${v.id}')">
                        <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart" id="fav-icon-${v.id}"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// YouTube API
function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtubePlayer', {
        playerVars: { 'autoplay': 1, 'controls': 1, 'rel': 0 },
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
    document.getElementById('floating-player').style.display = 'block';
    if (isPlayerReady) player.loadVideoById(id);

    document.getElementById('current-title').innerText = title;
    document.getElementById('current-channel').innerText = channel;

    const { data } = await client.from('videos').select('*').eq('id', id).single();
    if (data) {
        document.getElementById('bottom-description').innerText = data.description || "";
        document.getElementById('video-duration').innerText = data.duration || "00:00";
        if (data.published_at) {
            document.getElementById('current-date').innerText = new Date(data.published_at).toLocaleDateString('he-IL');
        }
        // הוספה להיסטוריה ב-DB במידה ומחובר
        if (currentUser) {
            await client.from('history').upsert({ user_id: currentUser.id, video_id: id, created_at: new Date() });
            loadSidebarLists();
        }
    }
}

function togglePlayPause() {
    if (!isPlayerReady) return;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
}

// גרירה ושינוי גודל
const floatingPlayer = document.getElementById('floating-player');
const dragHandle = document.getElementById('drag-handle');
const resizer = document.getElementById('resizer');

dragHandle.onmousedown = (e) => {
    let shiftX = e.clientX - floatingPlayer.getBoundingClientRect().left;
    let shiftY = e.clientY - floatingPlayer.getBoundingClientRect().top;
    document.onmousemove = (e) => {
        floatingPlayer.style.left = e.clientX - shiftX + 'px';
        floatingPlayer.style.top = e.clientY - shiftY + 'px';
    };
    document.onmouseup = () => document.onmousemove = null;
};

resizer.onmousedown = (e) => {
    e.preventDefault();
    const startWidth = floatingPlayer.offsetWidth;
    const startX = e.clientX;
    document.onmousemove = (e) => {
        const width = startWidth + (e.clientX - startX);
        floatingPlayer.style.width = width + 'px';
        floatingPlayer.style.height = (width * 0.56) + 30 + 'px';
    };
    document.onmouseup = () => document.onmousemove = null;
};

async function toggleFavorite(videoId) {
    if (!currentUser) return alert("עליך להתחבר");
    const isCurrentlyFav = userFavorites.includes(videoId);
    if (isCurrentlyFav) {
        await client.from('favorites').delete().eq('user_id', currentUser.id).eq('video_id', videoId);
        userFavorites = userFavorites.filter(id => id !== videoId);
    } else {
        await client.from('favorites').insert([{ user_id: currentUser.id, video_id: videoId }]);
        userFavorites.push(videoId);
    }
    fetchVideos(document.getElementById('globalSearch').value);
    loadSidebarLists();
}

async function loadSidebarLists() {
    if (!currentUser) return;
    const { data: favs } = await client.from('favorites').select('video_id, videos(id, title)').eq('user_id', currentUser.id);
    if (favs) {
        document.getElementById('favorites-list').innerHTML = favs.map(f => f.videos ? `
            <div class="nav-link">
                <span onclick="playVideo('${f.videos.id}', '${f.videos.title.replace(/'/g, "\\'")}', '')">${f.videos.title}</span>
            </div>` : '').join('');
    }
}

document.getElementById('globalSearch').addEventListener('input', (e) => fetchVideos(e.target.value));
init();
