const SUPABASE_URL = "https://ejixhprqrgrpmggfrdyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_EI_5JB62X3W91Deq2w7HoQ_Daqf_mE5";
const UNSPLASH_KEY = "Jlr46aClQ1a6d0wCt6UI8o27KhnH2qiZj-ZAI97JsGo";

// ─── Mode toggle ───────────────────────────────────────────
function switchMode(mode) {
    const filterStrip = document.getElementById("filterStrip");
    const aiStrip = document.getElementById("aiStrip");
    const filterBtn = document.getElementById("filterModeBtn");
    const aiBtn = document.getElementById("aiModeBtn");

    if (mode === "filter") {
        filterStrip.classList.remove("hidden");
        aiStrip.classList.add("hidden");
        filterBtn.classList.add("active");
        aiBtn.classList.remove("active");
    } else {
        filterStrip.classList.add("hidden");
        aiStrip.classList.remove("hidden");
        aiBtn.classList.add("active");
        filterBtn.classList.remove("active");
    }

    clearSearch();
}

// ─── Unsplash ──────────────────────────────────────────────
async function getUnsplashImage(locationName, city) {
    const query = encodeURIComponent(`${locationName} ${city} photography`);
    const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`,
        { headers: { "Authorization": `Client-ID ${UNSPLASH_KEY}` } }
    );
    const data = await response.json();
    if (data.results && data.results.length > 0) {
        return data.results[0].urls.regular;
    }
    return null;
}

// ─── Fetch all locations from Supabase ─────────────────────
async function fetchAllLocations() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/locations?select=*`, {
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`
        }
    });
    return await response.json();
}

// ─── Render cards ──────────────────────────────────────────
function renderCards(matchingLocations, aiExplanation = null) {
    const safetyClass = (safety) => {
        if (safety === "High") return "safety-high";
        if (safety === "Medium") return "safety-medium";
        return "safety-low";
    };

    if (matchingLocations.length === 0) {
        document.getElementById("results").innerHTML = `
            <div class="empty-state">
                <p>No locations match your search. Try a different style or city.</p>
            </div>
        `;
        return;
    }

    let explanationHTML = "";
    if (aiExplanation) {
        explanationHTML = `
            <div class="ai-explanation">
                <button class="ai-explanation-toggle" onclick="toggleExplanation()">Why these locations? ↓</button>
                <p class="ai-explanation-text hidden" id="aiExplanationText">${aiExplanation}</p>
            </div>
        `;
    }

    document.getElementById("results").innerHTML = `
        <div class="results-header">
            <span class="results-title">Locations</span>
            <span class="results-count">${matchingLocations.length} found</span>
        </div>
        ${explanationHTML}
        <div class="cards-grid" id="cardsGrid"></div>
    `;

    const grid = document.getElementById("cardsGrid");

    for (const location of matchingLocations) {
        const card = document.createElement("div");
        card.className = "location-card";
        card.style.cursor = "pointer";
        card.onclick = () => {
            window.open(`https://www.google.com/maps?q=${location.latitude},${location.longitude}`, '_blank');
        };
        card.innerHTML = `
            <div class="card-image-wrapper">
                <div class="card-image-placeholder"></div>
            </div>
            <div class="card-body">
                <span class="card-style-tag">${location.style}</span>
                <h3 class="card-name">${location.name}</h3>
                <p class="card-city">${location.city}</p>
                <p class="card-description">${location.description}</p>
                <div class="card-meta">
                    <div class="card-meta-item">
                        <span class="card-meta-label">Best Time</span>
                        <span class="card-meta-value">${location.bestTime}</span>
                    </div>
                    <div class="card-meta-item">
                        <span class="card-meta-label">Safety</span>
                        <span class="card-meta-value ${safetyClass(location.safety)}">${location.safety}</span>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);

        const resolveImage = location.image_url
            ? Promise.resolve(location.image_url)
            : getUnsplashImage(location.name, location.city);

        resolveImage.then(imageUrl => {
            const wrapper = card.querySelector(".card-image-wrapper");
            if (imageUrl) {
                wrapper.innerHTML = `<img class="card-image" src="${imageUrl}" alt="${location.name}" loading="lazy">`;
            } else {
                wrapper.innerHTML = `<div class="card-image-placeholder no-image">No image available</div>`;
            }
        });
    }
}

// ─── Toggle AI explanation ─────────────────────────────────
function toggleExplanation() {
    const text = document.getElementById("aiExplanationText");
    const btn = document.querySelector(".ai-explanation-toggle");
    if (text.classList.contains("hidden")) {
        text.classList.remove("hidden");
        btn.textContent = "Why these locations? ↑";
    } else {
        text.classList.add("hidden");
        btn.textContent = "Why these locations? ↓";
    }
}

// ─── Filter search ─────────────────────────────────────────
async function showSelection() {
    const searchText = document.getElementById("searchInput").value.toLowerCase();
    const selectedStyle = document.getElementById("styleSelect").value.toLowerCase();

    const locations = await fetchAllLocations();

    const matchingLocations = locations.filter(location => {
        const matchesStyle =
            selectedStyle === "" ||
            location.style.toLowerCase().includes(selectedStyle);

        const matchesSearch =
            searchText === "" ||
            location.style.toLowerCase().includes(searchText) ||
            location.city.toLowerCase().includes(searchText) ||
            location.description.toLowerCase().includes(searchText) ||
            location.bestTime.toLowerCase().includes(searchText) ||
            location.safety.toLowerCase().includes(searchText);

        return matchesStyle && matchesSearch;
    });

    renderCards(matchingLocations);
}

// ─── AI search ─────────────────────────────────────────────
async function runAISearch() {
    const query = document.getElementById("aiSearchInput").value.trim();
    if (!query) return;

    document.getElementById("results").innerHTML = `
        <div class="ai-loading">
            <p>Finding the best locations for you...</p>
        </div>
    `;

    const locations = await fetchAllLocations();

    const locationSummary = locations.map(l =>
        `ID:${l.id} | ${l.name} | ${l.city} | ${l.style} | Best Time: ${l.bestTime} | Safety: ${l.safety} | ${l.description}`
    ).join("\n");

    const prompt = `You are a photography location expert. A photographer is looking for locations with this request: "${query}"

Here are all available locations:
${locationSummary}

Return a JSON object with exactly this structure, no extra text, no markdown:
{
  "ids": [list of matching location IDs as numbers, best matches first, max 6],
  "explanation": "one sentence explanation only if the query is complex or specific, otherwise leave as empty string"
}`;

    try {
        const aiResponse = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt })
        });

        const aiData = await aiResponse.json();
        const raw = aiData.text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);

        const matchedLocations = parsed.ids
            .map(id => locations.find(l => l.id === id))
            .filter(Boolean);

        renderCards(matchedLocations, parsed.explanation || null);

    } catch (err) {
        document.getElementById("results").innerHTML = `
            <div class="empty-state">
                <p>AI search failed. Try the filter search instead.</p>
            </div>
        `;
    }
}

// ─── Clear ─────────────────────────────────────────────────
function clearSearch() {
    const searchInput = document.getElementById("searchInput");
    const aiSearchInput = document.getElementById("aiSearchInput");
    if (searchInput) searchInput.value = "";
    if (aiSearchInput) aiSearchInput.value = "";
    document.getElementById("results").innerHTML = "";
}