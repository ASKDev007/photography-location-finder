const SUPABASE_URL = "https://ejixhprqrgrpmggfrdyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_EI_5JB62X3W91Deq2w7HoQ_Daqf_mE5";

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
            location.description.toLowerCase().includes(searchText);

        return matchesStyle && matchesSearch;

    });

    let safetyClass = (safety) => {
        if (safety === "High") return "safety-high";
        if (safety === "Medium") return "safety-medium";
        return "safety-low";
    };

    let output = `
        <div class="results-header">
            <span class="results-title">Locations</span>
            <span class="results-count">${matchingLocations.length} found</span>
        </div>
        <div class="cards-grid">
    `;

    if (matchingLocations.length === 0) {
        output = `
            <div class="empty-state">
                <p>No locations match your search. Try a different style or city.</p>
            </div>
        `;
    } else {
        matchingLocations.forEach(location => {
            output += `
            <div class="location-card">
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
        });
        output += `</div>`;
    }

    document.getElementById("results").innerHTML = output;
}

function clearSearch() {
    document.getElementById("searchInput").value = "";
    document.getElementById("results").innerHTML = "";
}