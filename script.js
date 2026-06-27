const SUPABASE_URL = "https://ejixhprqrgrpmggfrdyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_EI_5JB62X3W91Deq2w7HoQ_Daqf_mE5";
const UNSPLASH_KEY = "Jlr46aClQ1a6d0wCt6UI8o27KhnH2qiZj-ZAI97JsGo";

async function getUnsplashImage(locationName, city) {
    const query = encodeURIComponent(`${locationName} ${city} photography`);
    const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`,
        {
            headers: {
                "Authorization": `Client-ID ${UNSPLASH_KEY}`
            }
        }
    );
    const data = await response.json();
    if (data.results && data.results.length > 0) {
        return data.results[0].urls.regular;
    }
    return null;
}

async function showSelection() {

    let searchText = document
        .getElementById("searchInput")
        .value
        .toLowerCase();

    let selectedStyle = document
        .getElementById("styleSelect")
        .value
        .toLowerCase();

    let response = await fetch(`${SUPABASE_URL}/rest/v1/locations?select=*`, {
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`
        }
    });

    let locations = await response.json();

    let matchingLocations = locations.filter(location => {

        let matchesStyle =
            selectedStyle === "" ||
            location.style.toLowerCase().includes(selectedStyle);

        let matchesSearch =
            searchText === "" ||
            location.style.toLowerCase().includes(searchText) ||
            location.city.toLowerCase().includes(searchText) ||
            location.description.toLowerCase().includes(searchText) ||
            location.bestTime.toLowerCase().includes(searchText) ||
            location.safety.toLowerCase().includes(searchText);

        return matchesStyle && matchesSearch;

    });

    let safetyClass = (safety) => {
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

    // Show loading state
    document.getElementById("results").innerHTML = `
        <div class="results-header">
            <span class="results-title">Locations</span>
            <span class="results-count">${matchingLocations.length} found</span>
        </div>
        <div class="cards-grid" id="cardsGrid"></div>
    `;

    // Render cards with images asynchronously
    const grid = document.getElementById("cardsGrid");

    for (const location of matchingLocations) {

        // Insert card immediately with placeholder
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

        // Fetch image and swap in
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

function clearSearch() {
    document.getElementById("searchInput").value = "";
    document.getElementById("results").innerHTML = "";
}