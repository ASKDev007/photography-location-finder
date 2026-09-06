const SUPABASE_URL = "https://ejixhprqrgrpmggfrdyq.supabase.co";
const SUPABASE_KEY = "sb_publishable_EI_5JB62X3W91Deq2w7HoQ_Daqf_mE5";
const UNSPLASH_KEY = "Jlr46aClQ1a6d0wCt6UI8o27KhnH2qiZj-ZAI97JsGo";

async function getUnsplashImage(locationName, city) {
    const query = encodeURIComponent(`${locationName} ${city} photography`);
    const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`,
        { headers: { "Authorization": `Client-ID ${UNSPLASH_KEY}` } }
    );
    const data = await response.json();
    if (data.results && data.results.length > 0) return data.results[0].urls.regular;
    return null;
}

async function fetchAllLocations() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/locations?select=*`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    return await response.json();
}

// ─── Fetch photowalks for a location ──────────────────────
async function fetchPhotowalks(locationId) {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/photowalks?location_id=eq.${locationId}&meetup_date=gte.${today}&order=meetup_date.asc`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
    );
    return await res.json();
}

// ─── Fetch RSVP count for a photowalk ─────────────────────
async function fetchRSVPCount(photoWalkId) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/photowalk_rsvps?photowalk_id=eq.${photoWalkId}&select=id`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    return data.length;
}

async function fetchPhotowalkAttendees(photoWalkId) {
    const token = localStorage.getItem("sb_token");
    if (!token) return null;

    const rsvpRes = await fetch(
        `${SUPABASE_URL}/rest/v1/photowalk_rsvps?photowalk_id=eq.${photoWalkId}&select=user_id`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
    );
    if (!rsvpRes.ok) return null;

    const rsvps = await rsvpRes.json();
    if (rsvps.length === 0) return { names: [], unnamedCount: 0 };

    const userIds = [...new Set(rsvps.map(rsvp => rsvp.user_id))];
    const params = new URLSearchParams({
        select: "id,display_name",
        id: `in.(${userIds.join(",")})`
    });
    const profilesRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${params.toString()}`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` }
    });
    if (!profilesRes.ok) return null;

    const profiles = await profilesRes.json();
    const namesById = new Map(profiles.map(profile => [profile.id, profile.display_name]));
    const names = [];
    let unnamedCount = 0;

    rsvps.forEach(rsvp => {
        const displayName = namesById.get(rsvp.user_id);
        if (displayName) names.push(displayName);
        else unnamedCount++;
    });

    return { names, unnamedCount };
}

async function renderPhotowalkAttendees(photoWalkId) {
    const listEl = document.getElementById(`attendees-${photoWalkId}`);
    if (!listEl) return;

    listEl.innerHTML = `<p class="empty-sub">Loading attendees...</p>`;
    const attendees = await fetchPhotowalkAttendees(photoWalkId);
    if (!attendees) {
        listEl.innerHTML = `<p class="empty-sub">Attendee names are unavailable right now.</p>`;
        return;
    }

    const namesHtml = attendees.names.length
        ? `<div class="attendee-names">${attendees.names.map(name => `<span class="attendee-name">${escapeHtml(name)}</span>`).join("")}</div>`
        : "";
    const unknownHtml = attendees.unnamedCount
        ? `<p class="empty-sub">${attendees.unnamedCount} attendee${attendees.unnamedCount === 1 ? "" : "s"} has not chosen a public display name.</p>`
        : "";

    listEl.innerHTML = namesHtml || unknownHtml || `<p class="empty-sub">No attendees yet.</p>`;
}

async function togglePhotowalkAttendees(event, photoWalkId) {
    event.stopPropagation();
    const listEl = document.getElementById(`attendees-${photoWalkId}`);
    const button = document.getElementById(`attendees-btn-${photoWalkId}`);
    if (!listEl || !button) return;

    const isOpen = !listEl.classList.contains("hidden");
    if (isOpen) {
        listEl.classList.add("hidden");
        button.textContent = "View attendees";
        return;
    }

    listEl.classList.remove("hidden");
    button.textContent = "Hide attendees";
    await renderPhotowalkAttendees(photoWalkId);
}

async function refreshPhotowalkAttendees(photoWalkId) {
    const listEl = document.getElementById(`attendees-${photoWalkId}`);
    if (listEl && !listEl.classList.contains("hidden")) {
        await renderPhotowalkAttendees(photoWalkId);
    }

    const countEl = document.getElementById(`pw-count-${photoWalkId}`);
    if (countEl) countEl.textContent = `${await fetchRSVPCount(photoWalkId)} attending`;
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
            <div class="empty-state"><p>No locations found. Try searching Mumbai, Goa, Jaipur, or Varanasi.</p></div>`;
        return;
    }

    document.getElementById("results").innerHTML = `
        <div class="results-header">
            <span class="results-title">Locations</span>
            <span class="results-count">${matchingLocations.length} found</span>
        </div>
        <div class="cards-grid" id="cardsGrid"></div>`;

    const grid = document.getElementById("cardsGrid");
    const user = localStorage.getItem("sb_user");

    for (const location of matchingLocations) {
        const card = document.createElement("div");
        card.className = "location-card";

        card.innerHTML = `
            <div class="card-image-wrapper" style="cursor:pointer;" onclick="window.open('https://www.google.com/maps?q=${location.latitude},${location.longitude}','_blank')">
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
                <div class="card-actions">
                    <button class="action-btn" onclick="window.open('https://www.google.com/maps?q=${location.latitude},${location.longitude}','_blank')">Open in Maps</button>
                    ${user ? `<button class="action-btn save-btn" id="save-btn-${location.id}" onclick="saveLocation(event,${location.id})">Save</button>` : ""}
                    ${user ? `<button class="action-btn" onclick="openItineraryPicker(event,${location.id})">+ Trip</button>` : ""}
                </div>
                <div class="card-toggle" onclick="togglePhotowalks(event, ${location.id}, this)">
                    <span class="toggle-text" id="toggle-label-${location.id}">Photowalks · Loading...</span>
                    <span class="toggle-icon">↓</span>
                </div>
                <div class="community hidden" id="community-${location.id}">
                    <div class="community-inner">
                        <div class="community-head">
    <span class="community-heading">Upcoming Photowalks</span>

    ${user
        ? `<button class="action-btn" onclick="openHostForm(event,${location.id})">
                Host a Photowalk
           </button>`
        : `
            <div class="community-guest-note">
                <span class="community-guest-title">Join the Photowalk community</span>
                <span class="community-guest-sub">
                    Sign in to join this Photowalk, view attendees, or host your own.
                </span>
                <button class="action-btn community-signin-btn" onclick="openAuth()">
                    Sign In
                </button>
            </div>
        `
    }
</div>
                        <div id="photowalk-list-${location.id}">
                            <p class="empty-sub">Loading...</p>
                        </div>
                        <div id="host-form-${location.id}" class="hidden">
                            <div class="host-form">
                                <input class="form-input" type="text" placeholder="Title e.g. Golden Hour Walk" id="pw-title-${location.id}">
                                <input class="form-input" type="text" placeholder="Theme e.g. Street · Beginner" id="pw-theme-${location.id}">
                                <input class="form-input" type="date" id="pw-date-${location.id}">
                                <input class="form-input" type="time" id="pw-time-${location.id}">
                                <div style="display:flex;gap:8px;margin-top:8px;">
                                    <button class="action-btn" onclick="submitPhotowalk(event,${location.id})">Confirm</button>
                                    <button class="action-btn" onclick="document.getElementById('host-form-${location.id}').classList.add('hidden')">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        grid.appendChild(card);

        // Load photowalk count for toggle label
        fetchPhotowalks(location.id).then(pws => {
            const label = document.getElementById(`toggle-label-${location.id}`);
            if (label) label.textContent = pws.length > 0 ? `Photowalks · ${pws.length} Upcoming` : `Photowalks · None Scheduled`;
        });

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    obs.unobserve(entry.target);
                    const wrapper = entry.target.querySelector(".card-image-wrapper");
                    const resolveImage = location.image_url
                        ? Promise.resolve(location.image_url)
                        : getUnsplashImage(location.name, location.city);
                    resolveImage.then(imageUrl => {
                        const img = imageUrl
                            ? `<img class="card-image" src="${imageUrl}" alt="${location.name}" loading="lazy" style="cursor:pointer;" onclick="window.open('https://www.google.com/maps?q=${location.latitude},${location.longitude}','_blank')">`
                            : `<div class="card-image-placeholder no-image"></div>`;
                        wrapper.innerHTML = img;
                    });
                }
            });
        }, { rootMargin: "200px" });

        observer.observe(card);
    }
}

function formatTime12Hour(time) {
    if (!time) return "";

    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours, 10);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${minutes} ${suffix}`;
}

// ─── Toggle photowalk section ──────────────────────────────
async function togglePhotowalks(event, locationId, toggleEl) {
    event.stopPropagation();

    const section = document.getElementById(`community-${locationId}`);
    const icon = toggleEl.querySelector(".toggle-icon");
    const isOpen = !section.classList.contains("hidden");

    if (isOpen) {
        section.classList.add("hidden");
        icon.style.transform = "";
        return;
    }

    section.classList.remove("hidden");
    icon.style.transform = "rotate(180deg)";

    const pws = await fetchPhotowalks(locationId);
    const listEl = document.getElementById(`photowalk-list-${locationId}`);
    const user = localStorage.getItem("sb_user");
    const currentUser = user ? JSON.parse(user) : null;

    if (pws.length === 0) {
        listEl.innerHTML = `
            <p class="empty-title">This location is waiting for its first photowalk.</p>
            <p class="empty-sub">Be the first to bring photographers together here.</p>`;
        return;
    }

    let html = "";

    for (const pw of pws) {
        const count = await fetchRSVPCount(pw.id);
        const date = new Date(pw.meetup_date);
        const month = date.toLocaleString("default", { month: "short" }).toUpperCase();
        const day = date.getDate();
        const alreadyRsvpd = currentUser ? await checkRSVP(pw.id, currentUser.id) : false;
        const isOwner = currentUser && pw.created_by === currentUser.id;

        html += `
            <div class="photowalk">
                <div class="pw-date">
                    <span class="pw-month">${month}</span>
                    <span class="pw-day">${day}</span>
                    <span class="pw-time">${formatTime12Hour(pw.meetup_time)}</span>
                </div>

                <div class="pw-info">
                    <span class="pw-title">${pw.title}</span>
                    ${pw.theme ? `<span class="pw-theme">${pw.theme}</span>` : ""}
                    <span class="pw-meta" id="pw-count-${pw.id}">${count} attending</span>

                    ${currentUser ? `
                        <button class="action-btn attendee-btn"
                            id="attendees-btn-${pw.id}"
                            onclick="togglePhotowalkAttendees(event,${pw.id})">
                            View attendees
                        </button>

                        <button class="action-btn share-btn"
                            onclick="sharePhotowalk(event,${pw.id},'${encodeURIComponent(pw.title)}')">
                            Share Photowalk
                        </button>

                        <div class="attendee-list hidden" id="attendees-${pw.id}"></div>
                    ` : ""}
                </div>

                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                    ${currentUser && !isOwner ? `
                        <button class="action-btn ${alreadyRsvpd ? "selected" : ""}" 
                            id="rsvp-btn-${pw.id}"
                            onclick="toggleRSVP(event,${pw.id},'${currentUser.id}',${alreadyRsvpd})">
                            ${alreadyRsvpd ? "Joined" : "Join Photowalk"}
                        </button>
                    ` : ""}

                    ${isOwner ? `
                        <button class="action-btn"
                            onclick="deletePhotowalk(event,${pw.id},${locationId})">
                            Cancel
                        </button>
                    ` : ""}
                </div>
            </div>`;
    }

    listEl.innerHTML = html;
}

// ─── Share photowalk ───────────────────────────────────────
async function sharePhotowalk(event, photowalkId, encodedTitle) {
    event.stopPropagation();

    const title = decodeURIComponent(encodedTitle);
    const shareUrl = `${window.location.origin}${window.location.pathname}?photowalk=${photowalkId}`;

    try {
        if (navigator.share) {
            await navigator.share({
                title: `PhotoSpot — ${title}`,
                text: `Join this Photowalk on PhotoSpot: ${title}`,
                url: shareUrl
            });
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareUrl);
            event.target.textContent = "Link Copied";
            setTimeout(() => {
                event.target.textContent = "Share Photowalk";
            }, 1800);
        } else {
            window.prompt("Copy this Photowalk link:", shareUrl);
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Photowalk sharing failed:", error);
        }
    }
}

// ─── Open shared Photowalk link ────────────────────────────
async function openSharedPhotowalk() {
    const params = new URLSearchParams(window.location.search);
    const photowalkId = params.get("photowalk");

    if (!photowalkId) return;

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/photowalks?id=eq.${photowalkId}&select=location_id`,
            {
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        const data = await res.json();
        if (!data.length) return;

        const locationId = data[0].location_id;

        const toggleEl = document.querySelector(
            `.card-toggle[onclick*="${locationId}"]`
        );

        if (!toggleEl) return;

        await togglePhotowalks(
            { stopPropagation: () => {} },
            locationId,
            toggleEl
        );

        toggleEl.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    } catch (error) {
        console.error("Unable to open shared Photowalk:", error);
    }
}

// ─── Check RSVP ───────────────────────────────────────────
async function checkRSVP(photoWalkId, userId) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/photowalk_rsvps?photowalk_id=eq.${photoWalkId}&user_id=eq.${userId}&select=id`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    return data.length > 0;
}

// ─── Toggle RSVP ──────────────────────────────────────────
async function toggleRSVP(event, photoWalkId, userId, alreadyJoined) {
    event.stopPropagation();
    const token = localStorage.getItem("sb_token");
    if (!token) { openAuth(); return; }
    if (!(await ensureProfileForPhotowalk())) return;
    const btn = event.target;

    if (alreadyJoined) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/photowalk_rsvps?photowalk_id=eq.${photoWalkId}&user_id=eq.${userId}`, {
            method: "DELETE",
            headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) { alert("Unable to leave this Photowalk. Please try again."); return; }
        btn.textContent = "Join Photowalk";
        btn.classList.remove("selected");
        btn.setAttribute("onclick", `toggleRSVP(event,${photoWalkId},'${userId}',false)`);
    } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/photowalk_rsvps`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ photowalk_id: photoWalkId, user_id: userId })
        });
        if (!res.ok) { alert("Unable to join this Photowalk. Please try again."); return; }
        btn.textContent = "Joined";
        btn.classList.add("selected");
        btn.setAttribute("onclick", `toggleRSVP(event,${photoWalkId},'${userId}',true)`);
    }
    await refreshPhotowalkAttendees(photoWalkId);
}

// ─── Open host form ───────────────────────────────────────
async function openHostForm(event, locationId) {
    event.stopPropagation();
    if (!(await ensureProfileForPhotowalk())) return;
    document.getElementById(`host-form-${locationId}`).classList.remove("hidden");
}

// ─── Submit photowalk ─────────────────────────────────────
async function submitPhotowalk(event, locationId) {
    event.stopPropagation();
    const token = localStorage.getItem("sb_token");
    const user = JSON.parse(localStorage.getItem("sb_user"));
    const title = document.getElementById(`pw-title-${locationId}`).value.trim();
    const theme = document.getElementById(`pw-theme-${locationId}`).value.trim();
    const date = document.getElementById(`pw-date-${locationId}`).value;
    const time = document.getElementById(`pw-time-${locationId}`).value;

    if (!title || !date || !time) return alert("Please fill in title, date and time.");

    await fetch(`${SUPABASE_URL}/rest/v1/photowalks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ location_id: locationId, created_by: user.id, title, theme, meetup_date: date, meetup_time: time })
    });

    document.getElementById(`host-form-${locationId}`).classList.add("hidden");
    // Refresh the photowalk list
    const fakeToggle = document.querySelector(`#community-${locationId}`).previousElementSibling;
    document.getElementById(`community-${locationId}`).classList.add("hidden");
    await togglePhotowalks(event, locationId, fakeToggle || { querySelector: () => ({ style: {} }) });
}

// ─── Delete photowalk ─────────────────────────────────────
async function deletePhotowalk(event, photoWalkId, locationId) {
    event.stopPropagation();
    const token = localStorage.getItem("sb_token");
    await fetch(`${SUPABASE_URL}/rest/v1/photowalks?id=eq.${photoWalkId}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` }
    });
    const listEl = document.getElementById(`photowalk-list-${locationId}`);
    if (listEl) listEl.innerHTML = `<p class="empty-sub">Photowalk cancelled.</p>`;
    const label = document.getElementById(`toggle-label-${locationId}`);
    if (label) label.textContent = "Photowalks · None Scheduled";
}

// ─── Filter search ─────────────────────────────────────────
async function showSelection() {
    const searchText = document.getElementById("searchInput").value.toLowerCase();
    const selectedStyle = document.getElementById("styleSelect").value.toLowerCase();
    document.getElementById("results").innerHTML = `<div class="ai-loading"><p>Finding locations...</p></div>`;

    const locations = await fetchAllLocations();
    const matchingLocations = locations.filter(location => {
        const matchesStyle = selectedStyle === "" || location.style.toLowerCase().includes(selectedStyle);
        const matchesSearch = searchText === "" ||
            location.name.toLowerCase().includes(searchText) ||
            location.style.toLowerCase().includes(searchText) ||
            location.city.toLowerCase().includes(searchText) ||
            location.description.toLowerCase().includes(searchText) ||
            location.bestTime.toLowerCase().includes(searchText) ||
            location.safety.toLowerCase().includes(searchText);
        return matchesStyle && matchesSearch;
    });

    matchingLocations.sort((a, b) => {
        const aName = a.name.toLowerCase().includes(searchText) ? -1 : 1;
        const bName = b.name.toLowerCase().includes(searchText) ? -1 : 1;
        return aName - bName;
    });

    renderCards(matchingLocations);
    markSavedLocations();
}

// ─── Auth ──────────────────────────────────────────────────
function openAuth() { document.getElementById("authModal").classList.remove("hidden"); }
function closeAuth() {
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("authMessage").textContent = "";
}

async function signUp() {
    const displayName = document.getElementById("authDisplayName").value.trim();
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    if (displayName.length < 2 || displayName.length > 40) {
        document.getElementById("authMessage").textContent = "Please choose a display name between 2 and 40 characters.";
        return;
    }
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
        body: JSON.stringify({ email, password, data: { display_name: displayName } })
    });
    const data = await res.json();
    document.getElementById("authMessage").textContent = data.user
        ? "Account created! You can now sign in."
        : (data.msg || data.error_description || data.message || data.error || "Something went wrong.");
}

async function signIn() {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;

    const res = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY
            },
            body: JSON.stringify({ email, password })
        }
    );

    const data = await res.json();

    if (data.access_token) {
        localStorage.setItem("sb_token", data.access_token);
        localStorage.setItem("sb_user", JSON.stringify(data.user));
        localStorage.setItem("sb_refresh_token", data.refresh_token);

        closeAuth();
        updateAuthUI(data.user);

        // Refresh any Photowalk sections that were already open
        const openSections = document.querySelectorAll(".community:not(.hidden)");

        for (const section of openSections) {
            const locationId = section.id.replace("community-", "");
            const toggleEl = section.previousElementSibling;

            section.classList.add("hidden");

            if (toggleEl) {
                await togglePhotowalks(
                    { stopPropagation: () => {} },
                    locationId,
                    toggleEl
                );
            }
        }
    } else {
        document.getElementById("authMessage").textContent =
            data.error_description || "Sign in failed.";
    }
}
function updateAuthUI(user) {
    const btn = document.getElementById("heroAuthBtn");
    const savedBtn = document.getElementById("savedBtn");
    const itineraryBtn = document.getElementById("itineraryNavBtn");
    if (user) {
        btn.textContent = `${user.email.split("@")[0]} — Sign Out`;
        btn.onclick = signOut;
        savedBtn.classList.remove("hidden");
        itineraryBtn.classList.remove("hidden");
    } else {
        btn.textContent = "Sign In";
        btn.onclick = openAuth;
        savedBtn.classList.add("hidden");
        itineraryBtn.classList.add("hidden");
    }
}

function signOut() {
    localStorage.removeItem("sb_token");
    localStorage.removeItem("sb_user");
    updateAuthUI(null);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
}

function openProfileSetup() {
    document.getElementById("profileModal").classList.remove("hidden");
}

function closeProfileSetup() {
    document.getElementById("profileModal").classList.add("hidden");
    document.getElementById("profileMessage").textContent = "";
}

async function hasCurrentUserProfile() {
    const token = localStorage.getItem("sb_token");
    const user = localStorage.getItem("sb_user");
    if (!token || !user) return;

    const parsedUser = JSON.parse(user);
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?select=id,display_name&id=eq.${parsedUser.id}`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
    );

    if (!res.ok) return null;
    const profiles = await res.json();
    return profiles.length > 0;
}

async function ensureProfileForPhotowalk() {
    const hasProfile = await hasCurrentUserProfile();
    if (hasProfile === false) {
        openProfileSetup();
        return false;
    }
    return true;
}

async function saveProfile() {
    const token = localStorage.getItem("sb_token");
    const user = localStorage.getItem("sb_user");
    const input = document.getElementById("profileDisplayName");
    const message = document.getElementById("profileMessage");
    if (!token || !user || !input || !message) return;

    const displayName = input.value.trim();
    if (displayName.length < 2 || displayName.length > 40) {
        message.textContent = "Use 2 to 40 characters.";
        return;
    }

    const parsedUser = JSON.parse(user);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ id: parsedUser.id, display_name: displayName })
    });

    if (res.ok) {
        input.value = "";
        message.textContent = "";
        closeProfileSetup();
    } else {
        message.textContent = "We couldn't save that display name. Please try again.";
    }
}

async function saveLocation(event, locationId) {
    event.stopPropagation();

    const token = localStorage.getItem("sb_token");
    if (!token) { openAuth(); return; }

    const user = JSON.parse(localStorage.getItem("sb_user"));
    const btn = event.target;

    const check = await fetch(
        `${SUPABASE_URL}/rest/v1/saved_locations?select=id&location_id=eq.${locationId}&user_id=eq.${user.id}`,
        {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            }
        }
    );

    const saved = await check.json();

    if (saved.length > 0) {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/saved_locations?id=eq.${saved[0].id}`,
            {
                method: "DELETE",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        if (res.ok) {
            btn.textContent = "Save";
            btn.classList.remove("selected");
        }
    } else {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/saved_locations`,
            {
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
            }
        );

        if (res.ok) {
            btn.textContent = "Saved";
            btn.classList.add("selected");
        }
    }
}

async function showSavedLocations() {
    const token = localStorage.getItem("sb_token");
    const user = JSON.parse(localStorage.getItem("sb_user"));
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/saved_locations?select=location_id&user_id=eq.${user.id}`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
    );
    const saved = await res.json();
    const ids = saved.map(s => s.location_id);
    if (ids.length === 0) {
        document.getElementById("results").innerHTML = `<div class="empty-state"><p>You haven't saved any locations yet.</p></div>`;
        return;
    }
    const allLocations = await fetchAllLocations();
    renderCards(allLocations.filter(l => ids.includes(l.id)));
    markSavedLocations();
}

async function markSavedLocations() {
    const token = localStorage.getItem("sb_token");
    const user = localStorage.getItem("sb_user");
    if (!token || !user) return;
    const parsed = JSON.parse(user);
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/saved_locations?select=location_id&user_id=eq.${parsed.id}`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
    );
    const saved = await res.json();
    saved.forEach(s => {
        const btn = document.getElementById(`save-btn-${s.location_id}`);
        if (btn) { btn.textContent = "Saved"; btn.classList.add("selected"); }
    });
}

function clearSearch() {
    document.getElementById("searchInput").value = "";
    document.getElementById("results").innerHTML = "";
}

async function refreshToken() {
    const refresh_token = localStorage.getItem("sb_refresh_token");
    if (!refresh_token) return;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
        body: JSON.stringify({ refresh_token })
    });
    const data = await res.json();
    if (data.access_token) {
        localStorage.setItem("sb_token", data.access_token);
        localStorage.setItem("sb_refresh_token", data.refresh_token);
        localStorage.setItem("sb_user", JSON.stringify(data.user));
    }
}

setInterval(refreshToken, 50 * 60 * 1000);

window.addEventListener("load", async () => {
    const user = localStorage.getItem("sb_user");
    if (user) updateAuthUI(JSON.parse(user));

    const locations = await fetchAllLocations();

    document.getElementById("locationCount").textContent =
        `${locations.length}+ locations across India`;

    drawWatermark();

    // Open a shared Photowalk if the URL contains ?photowalk=ID
    const params = new URLSearchParams(window.location.search);
    if (params.get("photowalk")) {
        showSelection().then(() => openSharedPhotowalk());
    }
});

function drawWatermark() {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const cities = "MUMBAI PUNE DELHI BANGALORE CHENNAI HYDERABAD KOCHI KOLKATA JAIPUR VARANASI AGRA SRINAGAR LEH SHIMLA MANALI AMRITSAR MUNNAR AHMEDABAD GOA MYSORE HAMPI UDAIPUR JAISALMER JODHPUR RISHIKESH DARJEELING COORG PONDICHERRY";
    ctx.font = "11px Georgia, serif";
    ctx.fillStyle = "rgba(26, 26, 24, 0.04)";
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-20 * Math.PI / 180);
    ctx.translate(-canvas.width, -canvas.height);
    ctx.strokeStyle = "rgba(26, 26, 24, 0.06)";
    ctx.lineWidth = 0.5;
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    for (let y = -canvas.height; y < canvas.height * 2; y += 45)
        for (let x = -canvas.width; x < canvas.width * 2; x += 320)
            ctx.fillText(cities, x + (y % 2 === 0 ? 0 : 160), y);
    ctx.restore();
}

// ─── Itinerary / Trip Planner ─────────────────────────────
async function fetchItineraries() {
    const token = localStorage.getItem("sb_token");
    const user = JSON.parse(localStorage.getItem("sb_user"));
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/itineraries?user_id=eq.${user.id}&order=created_at.desc`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
    );
    return await res.json();
}

async function fetchItineraryLocations(itineraryId) {
    const token = localStorage.getItem("sb_token");
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/itinerary_locations?itinerary_id=eq.${itineraryId}&order=position.asc`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
    );
    return await res.json();
}

async function createItinerary() {
    const token = localStorage.getItem("sb_token");
    const user = JSON.parse(localStorage.getItem("sb_user"));
    const name = document.getElementById("newItineraryName").value.trim();
    if (!name) return alert("Please enter a trip name.");

    await fetch(`${SUPABASE_URL}/rest/v1/itineraries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ user_id: user.id, name })
    });
    document.getElementById("newItineraryName").value = "";
    await showItineraries();
}

async function deleteItinerary(event, itineraryId) {
    event.stopPropagation();
    const token = localStorage.getItem("sb_token");
    if (!confirm("Delete this trip and all its saved locations?")) return;
    await fetch(`${SUPABASE_URL}/rest/v1/itineraries?id=eq.${itineraryId}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` }
    });
    await showItineraries();
}

// ─── "Add to Itinerary" picker modal (opened from a location card) ───
let pendingLocationId = null;

async function openItineraryPicker(event, locationId) {
    event.stopPropagation();
    const token = localStorage.getItem("sb_token");
    if (!token) { openAuth(); return; }
    pendingLocationId = locationId;

    const itineraries = await fetchItineraries();
    const listEl = document.getElementById("itineraryPickerList");
    listEl.innerHTML = itineraries.length
        ? itineraries.map(it => `
            <button class="action-btn" style="width:100%;margin-bottom:6px;"
                onclick="addLocationToItinerary(${it.id}, ${pendingLocationId})">
                ${it.name}
            </button>`).join("")
        : `<p class="empty-sub">No trips yet — create one below.</p>`;

    document.getElementById("itineraryPickerModal").classList.remove("hidden");
}

function closeItineraryPicker() {
    document.getElementById("itineraryPickerModal").classList.add("hidden");
    document.getElementById("newTripNameInline").value = "";
    pendingLocationId = null;
}

async function createItineraryAndAdd() {
    const token = localStorage.getItem("sb_token");
    const user = JSON.parse(localStorage.getItem("sb_user"));
    const name = document.getElementById("newTripNameInline").value.trim();
    if (!name) return alert("Please enter a trip name.");

    const res = await fetch(`${SUPABASE_URL}/rest/v1/itineraries`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json", "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${token}`, "Prefer": "return=representation"
        },
        body: JSON.stringify({ user_id: user.id, name })
    });
    const [created] = await res.json();
    await addLocationToItinerary(created.id, pendingLocationId);
}

async function addLocationToItinerary(itineraryId, locationId) {
    const token = localStorage.getItem("sb_token");
    const existing = await fetchItineraryLocations(itineraryId);
    const nextPosition = existing.length
        ? Math.max(...existing.map(r => r.position)) + 1
        : 0;

    await fetch(`${SUPABASE_URL}/rest/v1/itinerary_locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ itinerary_id: itineraryId, location_id: locationId, position: nextPosition })
    });
    closeItineraryPicker();
    alert("Added to itinerary.");
}

// ─── "My Itineraries" view (renders into #results, like showSavedLocations) ───
async function showItineraries() {
    const itineraries = await fetchItineraries();
    const resultsEl = document.getElementById("results");

    resultsEl.innerHTML = `
        <div class="results-header">
            <span class="results-title">My Itineraries</span>
        </div>
        <div class="host-form" style="max-width:320px;margin-bottom:24px;">
            <input class="form-input" type="text" id="newItineraryName" placeholder="New trip name e.g. Rajasthan Winter Trip">
            <button class="action-btn" onclick="createItinerary()">Create Trip</button>
        </div>
        <div id="itineraryListGrid" class="cards-grid"></div>`;

    const grid = document.getElementById("itineraryListGrid");
    if (itineraries.length === 0) {
        grid.innerHTML = `<p class="empty-sub">No trips yet. Create one above.</p>`;
        return;
    }

    grid.innerHTML = itineraries.map(it => `
        <div class="location-card" style="cursor:pointer;" onclick="openItinerary(${it.id}, '${it.name.replace(/'/g, "\\'")}')">
            <div class="card-body">
                <h3 class="card-name">${it.name}</h3>
                <p class="card-city">Created ${new Date(it.created_at).toLocaleDateString()}</p>
                <div class="card-actions">
                    <button class="action-btn" onclick="deleteItinerary(event, ${it.id})">Delete Trip</button>
                </div>
            </div>
        </div>`).join("");
}

// ─── Itinerary detail view: list, remove, reorder ───
async function openItinerary(itineraryId, itineraryName) {
    const rows = await fetchItineraryLocations(itineraryId);
    const allLocations = await fetchAllLocations();
    const resultsEl = document.getElementById("results");

    if (rows.length === 0) {
        resultsEl.innerHTML = `
            <div class="results-header"><span class="results-title">${itineraryName}</span></div>
            <p class="empty-sub">No locations added yet. Go add some from the search results.</p>
            <button class="action-btn" style="max-width:160px;margin-top:12px;" onclick="showItineraries()">← Back to Trips</button>`;
        return;
    }

    const orderedRows = rows.sort((a, b) => a.position - b.position);
    const itemsHtml = orderedRows.map((row, idx) => {
        const loc = allLocations.find(l => l.id === row.location_id);
        if (!loc) return "";
        return `
            <div class="photowalk" id="itin-row-${row.id}">
                <div class="pw-date"><span class="pw-day">${idx + 1}</span></div>
                <div class="pw-info">
                    <span class="pw-title">${loc.name}</span>
                    <span class="pw-theme">${loc.city} · ${loc.style}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                    <div style="display:flex;gap:4px;">
                        ${idx > 0 ? `<button class="action-btn" onclick="moveItineraryLocation(${itineraryId},${row.id},'up')">↑</button>` : ""}
                        ${idx < orderedRows.length - 1 ? `<button class="action-btn" onclick="moveItineraryLocation(${itineraryId},${row.id},'down')">↓</button>` : ""}
                    </div>
                    <button class="action-btn" onclick="removeLocationFromItinerary(${itineraryId},${row.id})">Remove</button>
                </div>
            </div>`;
    }).join("");

    resultsEl.innerHTML = `
        <div class="results-header"><span class="results-title">${itineraryName}</span></div>
        <div class="community" style="border-top:none;">
            <div class="community-inner">${itemsHtml}</div>
        </div>
        <button class="action-btn" style="max-width:160px;margin-top:16px;" onclick="showItineraries()">← Back to Trips</button>`;
}

async function removeLocationFromItinerary(itineraryId, rowId) {
    const token = localStorage.getItem("sb_token");
    await fetch(`${SUPABASE_URL}/rest/v1/itinerary_locations?id=eq.${rowId}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` }
    });
    const row = document.getElementById(`itin-row-${rowId}`);
    if (row) {
        const nameEl = document.querySelector(".results-title");
        openItinerary(itineraryId, nameEl ? nameEl.textContent : "Itinerary");
    }
}

async function moveItineraryLocation(itineraryId, rowId, direction) {
    const token = localStorage.getItem("sb_token");
    const rows = (await fetchItineraryLocations(itineraryId)).sort((a, b) => a.position - b.position);
    const idx = rows.findIndex(r => r.id === rowId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return;

    const a = rows[idx], b = rows[swapIdx];
    await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/itinerary_locations?id=eq.${a.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ position: b.position })
        }),
        fetch(`${SUPABASE_URL}/rest/v1/itinerary_locations?id=eq.${b.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ position: a.position })
        })
    ]);
    const nameEl = document.querySelector(".results-title");
    openItinerary(itineraryId, nameEl ? nameEl.textContent : "Itinerary");
}
