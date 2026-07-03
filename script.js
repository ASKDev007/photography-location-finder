const SUPABASE_URL = "https://ejixhprqrgrpmggfrdyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_EI_5JB62X3W91Deq2w7HoQ_Daqf_mE5";
const UNSPLASH_KEY = "Jlr46aClQ1a6d0wCt6UI8o27KhnH2qiZj-ZAI97JsGo";

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
function renderCards(matchingLocations) {
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

    document.getElementById("results").innerHTML = `
        <div class="results-header">
            <span class="results-title">Locations</span>
            <span class="results-count">${matchingLocations.length} found</span>
        </div>
        <div class="cards-grid" id="cardsGrid"></div>
    `;

    const grid = document.getElementById("cardsGrid");
    const user = localStorage.getItem("sb_user");

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
                ${user ? `<button class="save-btn" onclick="saveLocation(event, ${location.id})">♥ Save</button>` : ""}
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

// ─── Auth ──────────────────────────────────────────────────
function openAuth() {
    document.getElementById("authModal").classList.remove("hidden");
}

function closeAuth() {
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("authMessage").textContent = "";
}

async function signUp() {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;

    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY
        },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (data.user) {
        document.getElementById("authMessage").textContent = "Account created! You can now sign in.";
    } else {
        document.getElementById("authMessage").textContent = data.msg || "Something went wrong.";
    }
}

async function signIn() {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY
        },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (data.access_token) {
        localStorage.setItem("sb_token", data.access_token);
        localStorage.setItem("sb_user", JSON.stringify(data.user));
        closeAuth();
        updateAuthUI(data.user);
    } else {
        document.getElementById("authMessage").textContent = data.error_description || "Sign in failed.";
    }
}

function updateAuthUI(user) {
    const btn = document.getElementById("heroAuthBtn");
    const savedBtn = document.getElementById("savedBtn");
    if (user) {
        btn.textContent = `${user.email.split("@")[0]} — Sign Out`;
        btn.onclick = signOut;
        savedBtn.classList.remove("hidden");
    } else {
        btn.textContent = "Sign In";
        btn.onclick = openAuth;
        savedBtn.classList.add("hidden");
    }
}

function signOut() {
    localStorage.removeItem("sb_token");
    localStorage.removeItem("sb_user");
    updateAuthUI(null);
}

// ─── Save location ─────────────────────────────────────────
async function saveLocation(event, locationId) {
    event.stopPropagation();
    const token = localStorage.getItem("sb_token");
    if (!token) { openAuth(); return; }

    const user = JSON.parse(localStorage.getItem("sb_user"));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/saved_locations`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            location_id: locationId,
            user_id: user.id
        })
    });

    if (res.ok) {
        event.target.textContent = "♥ Saved";
        event.target.style.color = "#1a5590";
    }
}

// ─── Saved locations view ──────────────────────────────────
async function showSavedLocations() {
    const token = localStorage.getItem("sb_token");
    const user = JSON.parse(localStorage.getItem("sb_user"));

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/saved_locations?select=location_id&user_id=eq.${user.id}`,
        {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            }
        }
    );

    const saved = await res.json();
    const ids = saved.map(s => s.location_id);

    if (ids.length === 0) {
        document.getElementById("results").innerHTML = `
            <div class="empty-state">
                <p>You haven't saved any locations yet.</p>
            </div>
        `;
        return;
    }

    const allLocations = await fetchAllLocations();
    const savedLocations = allLocations.filter(l => ids.includes(l.id));
    renderCards(savedLocations);
}

// ─── Clear ─────────────────────────────────────────────────
function clearSearch() {
    document.getElementById("searchInput").value = "";
    document.getElementById("results").innerHTML = "";
}

// ─── On load ───────────────────────────────────────────────
window.addEventListener("load", () => {
    const user = localStorage.getItem("sb_user");
    if (user) updateAuthUI(JSON.parse(user));

    fetchAllLocations().then(locations => {
        const count = locations.length;
        document.getElementById("locationCount").textContent = `${count}+ locations across India`;
    });
});