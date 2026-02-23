// קונפיגורציה
const SB_URL = 'https://fbzewdfubjfhqvlusyrj.supabase.co';
const SB_KEY = 'sb_publishable_2JftgVsArBG2NB-RXp0q4Q_jdd8VfPO';
const client = supabase.createClient(SB_URL, SB_KEY);

let translationTimer = null;

// --- פונקציית התרגום (התוספת היחידה) ---
async function getTranslation(text) {
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=iw&tl=en&dt=t&q=${encodeURI(text)}`);
        const data = await res.json();
        return data[0][0][0];
    } catch (e) { return null; }
}

function toggleSpinner(show) {
    const spinner = document.getElementById('searchSpinner');
    if (spinner) spinner.style.display = show ? 'block' : 'none';
}

// --- פונקציית החיפוש המקורית עם שינוי מינימלי ---
async function fetchVideos(query = "", isAppend = false) {
    let request = client.from('videos').select('*');

    if (query) {
        // שימוש ב-or כדי לחפש בכל השדות (כותרת, תיאור, ערוץ)
        request = request.or(`title.ilike.%${query}%,description.ilike.%${query}%,channel_title.ilike.%${query}%`);
    }

    const { data, error } = await request.order('added_at', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    if (isAppend) {
        // מוסיף תוצאות בלי למחוק את הקיימות (עבור התרגום)
        renderGrid([...currentLocalData, ...data]); 
    } else {
        window.currentLocalData = data; // שמירה זמנית של התוצאות בעברית
        renderGrid(data);
    }
}

// --- המאזין לחיפוש ---
document.getElementById('globalSearch').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    
    // 1. חיפוש מיידי (בלי תרגום)
    fetchVideos(val, false);

    // 2. תרגום מושהה (רק אם יש עברית)
    clearTimeout(translationTimer);
    if (val.length > 2 && /[\u0590-\u05FF]/.test(val)) {
        translationTimer = setTimeout(async () => {
            toggleSpinner(true);
            const translated = await getTranslation(val);
            if (translated) {
                await fetchVideos(translated, true); // true אומר "תלביש על התוצאות הקיימות"
            }
            toggleSpinner(false);
        }, 800);
    }
});

// פונקציית הרינדור המקורית שלך (תוודא ששמות השדות thumbnail ו-video_id נכונים)
function renderGrid(videos) {
    const container = document.getElementById('videoGrid');
    if (!container) return;
    
    // הסרת כפילויות (למקרה שאותו סרטון עלה גם בעברית וגם באנגלית)
    const uniqueVideos = Array.from(new Map(videos.map(v => [v.id, v])).values());

    container.innerHTML = uniqueVideos.map(video => `
        <div class="video-card">
            <a href="https://www.youtube.com/watch?v=${video.video_id || video.youtube_id}" target="_blank">
                <img src="${video.thumbnail || video.thumbnail_url}" alt="${video.title}">
                <h3>${video.title}</h3>
            </a>
        </div>
    `).join('');
}

// טעינה ראשונית
document.addEventListener('DOMContentLoaded', () => fetchVideos(""));
