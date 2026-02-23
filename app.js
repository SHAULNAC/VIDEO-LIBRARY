// קונפיגורציה
const SB_URL = 'https://fbzewdfubjfhqvlusyrj.supabase.co';
const SB_KEY = 'sb_publishable_2JftgVsArBG2NB-RXp0q4Q_jdd8VfPO';
const client = supabase.createClient(SB_URL, SB_KEY);

let localSearchTimer = null;
let translationTimer = null;
let currentResults = []; // מאגר התוצאות המוצגות כרגע

// --- פונקציות עזר ---

// פונקציה להצגת/הסתרת הספינר
function toggleSpinner(show) {
    const spinner = document.getElementById('searchSpinner');
    if (spinner) spinner.style.display = show ? 'block' : 'none';
}

// פונקציית התרגום החכמה עם Cache (סעיף 2 שבנינו)
async function getSmartTranslation(text) {
    const cleanText = text.trim().toLowerCase();
    
    // 1. בדיקה במטמון ב-Supabase
    const { data: cacheEntry } = await client
        .from('translation_cache')
        .select('translated_text')
        .eq('original_text', cleanText)
        .single();

    if (cacheEntry) return cacheEntry.translated_text;

    // 2. פנייה לגוגל אם לא נמצא במטמון
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=iw&tl=en&dt=t&q=${encodeURI(cleanText)}`);
        const data = await res.json();
        const translated = data[0][0][0];

        if (translated && translated.toLowerCase() !== cleanText) {
            // שמירה למטמון לשימוש עתידי (בשביל עשרות אלפי המשתמשים הבאים)
            await client.from('translation_cache').insert([
                { original_text: cleanText, translated_text: translated }
            ]);
            return translated;
        }
    } catch (e) {
        console.error("Translation error:", e);
    }
    return null;
}

// --- פונקציות ליבת החיפוש ---

async function performSearch(query, isTranslation = false) {
    if (!query) return;

    // חיפוש גמיש בטבלת הסרטונים (בדומה ל-Regex)
    const { data, error } = await client
        .from('videos')
        .select('*')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%,channel_title.ilike.%${query}%`);

    if (error) {
        console.error("Search error:", error);
        return;
    }

    if (isTranslation) {
        // הוספת תוצאות התרגום לתוצאות הקיימות (מניעת כפילויות)
        const existingIds = new Set(currentResults.map(v => v.id));
        const filteredNewData = data.filter(v => !existingIds.has(v.id));
        currentResults = [...currentResults, ...filteredNewData];
    } else {
        currentResults = data;
    }

    renderGrid(currentResults);
}

// פונקציה לרינדור הגלריה (וודא שהיא קיימת אצלך)
function renderGrid(videos) {
    const container = document.getElementById('videoGrid');
    if (!container) return;
    
    container.innerHTML = videos.map(video => `
        <div class="video-card">
            <img src="${video.thumbnail_url}" alt="${video.title}">
            <h3>${video.title}</h3>
            <p>${video.channel_title}</p>
        </div>
    `).join('');
}

// --- מאזין אירועים (Event Listener) ---

document.getElementById('globalSearch').addEventListener('input', (e) => {
    const val = e.target.value.trim();
    
    if (!val) {
        // אם החיפוש התרוקן, טען את כל הסרטונים (או נקה)
        location.reload(); 
        return;
    }

    // 1. חיפוש מקומי מהיר (300ms) - קורה בזמן הקלדה
    clearTimeout(localSearchTimer);
    localSearchTimer = setTimeout(() => {
        performSearch(val, false);
    }, 300);

    // 2. תרגום וחיזוק תוצאות (900ms) - קורה בסיום ההקלדה
    clearTimeout(translationTimer);
    translationTimer = setTimeout(async () => {
        if (val.length > 2 && /[\u0590-\u05FF]/.test(val)) {
            toggleSpinner(true); // הצגת ספינר
            const translated = await getSmartTranslation(val);
            if (translated) {
                await performSearch(translated, true);
            }
            toggleSpinner(false); // הסתרת ספינר
        }
    }, 900);
});
