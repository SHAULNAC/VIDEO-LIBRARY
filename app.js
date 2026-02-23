// קונפיגורציה
const SB_URL = 'https://fbzewdfubjfhqvlusyrj.supabase.co';
const SB_KEY = 'sb_publishable_2JftgVsArBG2NB-RXp0q4Q_jdd8VfPO';
const client = supabase.createClient(SB_URL, SB_KEY);

let translationTimer = null;
let currentLocalData = []; // שמירת נתוני המקור

// --- פונקציות תרגום ו-Cache ---

async function getSmartTranslation(text) {
    const cleanText = text.trim().toLowerCase();
    
    // 1. בדיקה במטמון (Cache)
    const { data: cacheEntry } = await client
        .from('translation_cache')
        .select('translated_text')
        .eq('original_text', cleanText)
        .single();

    if (cacheEntry) return cacheEntry.translated_text;

    // 2. פנייה לגוגל ושמירה למטמון
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=iw&tl=en&dt=t&q=${encodeURI(cleanText)}`);
        const data = await res.json();
        const translated = data[0][0][0];

        if (translated && translated.toLowerCase() !== cleanText) {
            await client.from('translation_cache').insert([{ original_text: cleanText, translated_text: translated }]);
            return translated;
        }
    } catch (e) { console.error("Translation error", e); }
    return null;
}

function toggleSpinner(show) {
    const spinner = document.getElementById('searchSpinner');
    if (spinner) spinner.style.display = show ? 'block' : 'none';
}

// --- ליבת המערכת ---

async function fetchVideos(query = "", isAppend = false) {
    let request = client.from('videos').select('*');

    if (query) {
        // חיפוש "על הכל" (כותרת, תיאור, ערוץ)
        request = request.or(`title.ilike.%${query}%,description.ilike.%${query}%,channel_title.ilike.%${query}%`);
    }

    const { data, error } = await request.order('added_at', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    if (isAppend) {
        // מיזוג תוצאות התרגום עם הקיימות ומניעת כפילויות
        const combined = [...currentLocalData, ...data];
        const unique = Array.from(new Map(combined.map(v => [v.id, v])).values());
        renderGrid(unique);
    } else {
        currentLocalData = data;
        renderGrid(data);
    }
}

// --- המאזין לחיפוש ---

document.getElementById('globalSearch').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    
    if (!val) {
        fetchVideos(""); // טעינה מחדש של הכל
        return;
    }

    // 1. חיפוש מיידי (שפת מקור)
    fetchVideos(val, false);

    // 2. תרגום Cache/Google (מושהה)
    clearTimeout(translationTimer);
    if (val.length > 2 && /[\u0590-\u05FF]/.test(val)) {
        translationTimer = setTimeout(async () => {
            toggleSpinner(true);
            const translated = await getSmartTranslation(val);
            if (translated) {
                await fetchVideos(translated, true);
            }
            toggleSpinner(false);
        }, 850);
    }
});

// --- פונקציית הרינדור (התבנית המקורית שלך) ---

function renderGrid(videos) {
    const container = document.getElementById('videoGrid');
    if (!container) return;
    
    // תיקון ה-Layout (שמירה על 5 בטור אם הגדרת ב-CSS)
    // אם ה-CSS שלך משתנה בחיפוש, נוודא שהקלאס נשאר קבוע
    container.className = "video-grid-container"; 

    container.innerHTML = videos.map(video => `
        <div class="video-card">
            <a href="https://www.youtube.com/watch?v=${video.video_id || video.youtube_id}" target="_blank">
                <div class="thumbnail-wrapper">
                    <img src="${video.thumbnail || video.thumbnail_url}" alt="${video.title}">
                </div>
                <div class="video-details">
                    <h3>${video.title}</h3>
                    <p>${video.channel_title || ''}</p>
                </div>
            </a>
        </div>
    `).join('');
}

// טעינה ראשונית
document.addEventListener('DOMContentLoaded', () => fetchVideos(""));
