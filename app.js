const SB_URL = 'https://fbzewdfubjfhqvlusyrj.supabase.co';
const SB_KEY = 'sb_publishable_2JftgVsArBG2NB-RXp0q4Q_jdd8VfPO';
const client = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let userFavorites = [];
let isPlaying = false;

async function init() {
    const { data: { user } } = await client.auth.getUser();
    currentUser = user;
    updateUserUI();
    if (user) loadSidebarLists();
    fetchVideos();
}

// --- ניהול הנגן ---
function playVideo(id, title, channel) {
    const playerWin = document.getElementById('floating-player');
    const container = document.getElementById('youtubePlayer');
    
    playerWin.style.display = 'block';
    // הוספת enablejsapi=1 קריטית לשליטה מהמקלדת
    container.innerHTML = `
        <iframe id="yt-iframe" 
                src="https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0&controls=1" 
                frameborder="0" 
                allow="autoplay; encrypted-media" 
                allowfullscreen>
        </iframe>`;
    
    document.getElementById('current-title').innerText = title;
    document.getElementById('current-channel').innerText = channel;
    isPlaying = true;
    updatePlayStatus(true);
}

// שליחת פקודות ל-Iframe (עוקף חסימת נטפרי)
function sendPlayerCommand(func, args = []) {
    const iframe = document.getElementById('yt-iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: func,
            args: args
        }), '*');
    }
}

function togglePlayPause() {
    sendPlayerCommand(isPlaying ? 'pauseVideo' : 'playVideo');
    isPlaying = !isPlaying;
    updatePlayStatus(isPlaying);
}

function updatePlayStatus(playing) {
    const icon = document.getElementById('play-icon');
    if (icon) icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
}

// --- האזנה למקלדת ---
document.addEventListener('keydown', (e) => {
    // מניעת גלילה עם החיצים כשהחלון פתוח
    if (document.getElementById('floating-player').style.display === 'block') {
        if (e.code === "Space") {
            e.preventDefault();
            togglePlayPause();
        }
        // בגלל שנטפרי חוסמת את ה-API, פקודות הווליום ב-postMessage לא תמיד עובדות,
        // אבל ננסה להעביר את הפוקוס ל-iframe כדי שהחיצים המובנים שלו יעבדו:
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
            document.getElementById('yt-iframe').focus();
        }
    }
});

// --- לוגיקת גרירה חסינה (תיקון) ---
const floatingPlayer = document.getElementById('floating-player');
const dragHandle = document.getElementById('drag-handle');

dragHandle.onmousedown = function(e) {
    e.preventDefault();
    dragHandle.style.cursor = 'grabbing';
    
    const rect = floatingPlayer.getBoundingClientRect();
    let shiftX = e.clientX - rect.left;
    let shiftY = e.clientY - rect.top;

    function moveAt(pageX, pageY) {
        // מניעת "בריחה" מהמסך
        let newX = pageX - shiftX;
        let newY = pageY - shiftY;
        
        floatingPlayer.style.left = newX + 'px';
        floatingPlayer.style.top = newY + 'px';
        floatingPlayer.style.bottom = 'auto';
    }

    function onMouseMove(event) {
        moveAt(event.clientX, event.clientY);
    }

    document.addEventListener('mousemove', onMouseMove);

    document.onmouseup = function() {
        document.removeEventListener('mousemove', onMouseMove);
        dragHandle.style.cursor = 'grab';
        document.onmouseup = null;
    };
};

// מניעת באגים של גרירת דפדפן
dragHandle.ondragstart = () => false;

// --- יתר הפונקציות (חיפוש, UI וכו') ---
function updateUserUI() {
    const userDiv = document.getElementById('user-profile');
    if (currentUser && userDiv) {
        userDiv.innerHTML = `<img src="${currentUser.user_metadata.avatar_url}" style="width:35px; border-radius:50%; border: 2px solid #1DB954;">
            <div style="display:flex; flex-direction:column;"><span style="font-size:14px; font-weight:bold;">${currentUser.user_metadata.full_name}</span>
            <span onclick="client.auth.signOut().then(()=>location.reload())" style="color:#b3b3b3; font-size:11px; cursor:pointer;">התנתק</span></div>`;
    }
}

async function fetchVideos(query = "") {
    let { data } = query.trim() 
        ? await client.rpc('search_videos_prioritized', { search_term: query }) 
        : await client.from('videos').select('*').order('published_at', { ascending: false });
    
    const grid = document.getElementById('videoGrid');
    if (grid) grid.innerHTML = (data || []).map(v => `
        <div class="v-card" onclick="playVideo('${v.id}', '${v.title.replace(/'/g, "\\'")}', '${v.channel_title.replace(/'/g, "\\'")}')">
            <div class="card-img-container">
                <img src="${v.thumbnail}" loading="lazy">
            </div>
            <h3>${v.title}</h3>
            <div class="card-footer"><span>${v.channel_title}</span></div>
        </div>
    `).join('');
}

document.getElementById('globalSearch')?.addEventListener('input', (e) => fetchVideos(e.target.value));
init();
