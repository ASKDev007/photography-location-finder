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

/* ─── Random hero image ─────────────────────────────────── */
async function setHeroImage() {
    const heroImage = document.getElementById("heroImage");
    if (!heroImage) return;

    try {
        const response = await fetch(
            `https://api.unsplash.com/search/photos?query=India%20landscape%20photography&per_page=30&orientation=landscape&_=${Date.now()}`,
            {
                headers: { "Authorization": `Client-ID ${UNSPLASH_KEY}` },
                cache: "no-store"
            }
        );

        const data = await response.json();
        const results = data.results || [];

        if (results.length > 0) {
            const chosen = results[Math.floor(Math.random() * results.length)];
            const imageUrl = chosen.urls?.regular;

            if (imageUrl) {
                heroImage.style.opacity = "0";

                heroImage.onload = () => {
                    heroImage.style.opacity = "1";
                };

                heroImage.src =
                    `${imageUrl}&auto=format&fit=crop&w=1400&q=85`;
            }
        }
    } catch (error) {
        console.warn("Hero image could not be loaded:", error);
    }
}


/* ─── Fetch all locations ───────────────────────────────── */
async function fetchAllLocations() {
    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/locations?select=*`,
        {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    return await response.json();
}


/* ─── Fetch photowalks for a location ───────────────────── */
async function fetchPhotowalks(locationId) {
    const today = new Date().toISOString().split("T")[0];

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/photowalks?location_id=eq.${locationId}&meetup_date=gte.${today}&order=meetup_date.asc`,
        {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    return await res.json();
}


/* ─── Fetch RSVP count ──────────────────────────────────── */
async function fetchRSVPCount(photoWalkId) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/photowalk_rsvps?photowalk_id=eq.${photoWalkId}&select=id`,
        {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    const data = await res.json();
    return data.length;
}


/* ─── Fetch photowalk attendees ──────────────────────────── */
async function fetchPhotowalkAttendees(photoWalkId) {
    const token = localStorage.getItem("sb_token");

    if (!token) return null;

    const rsvpRes = await fetch(
        `${SUPABASE_URL}/rest/v1/photowalk_rsvps?photowalk_id=eq.${photoWalkId}&select=user_id`,
        {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            }
        }
    );

    if (!rsvpRes.ok) return null;

    const rsvps = await rsvpRes.json();

    if (rsvps.length === 0) {
        return {
            names: [],
            unnamedCount: 0
        };
    }

    const userIds = [...new Set(rsvps.map(rsvp => rsvp.user_id))];

    const params = new URLSearchParams({
        select: "id,display_name",
        id: `in.(${userIds.join(",")})`
    });

    const profilesRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?${params.toString()}`,
        {
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            }
        }
    );

    if (!profilesRes.ok) return null;

    const profiles = await profilesRes.json();

    const namesById = new Map(
        profiles.map(profile => [
            profile.id,
            profile.display_name
        ])
    );

    const names = [];
    let unnamedCount = 0;

    rsvps.forEach(rsvp => {
        const displayName = namesById.get(rsvp.user_id);

        if (displayName) {
            names.push(displayName);
        } else {
            unnamedCount++;
        }
    });

    return {
        names,
        unnamedCount
    };
}


/* ─── Render photowalk attendees ────────────────────────── */
async function renderPhotowalkAttendees(photoWalkId) {
    const listEl =
        document.getElementById(`attendees-${photoWalkId}`);

    if (!listEl) return;

    listEl.innerHTML =
        `<p class="empty-sub">Loading attendees...</p>`;

    const attendees =
        await fetchPhotowalkAttendees(photoWalkId);

    if (!attendees) {
        listEl.innerHTML =
            `<p class="empty-sub">Attendee names are unavailable right now.</p>`;
        return;
    }

    const namesHtml = attendees.names.length
        ? `<div class="attendee-names">
            ${attendees.names
                .map(name =>
                    `<span class="attendee-name">
                        ${escapeHtml(name)}
                    </span>`
                )
                .join("")}
           </div>`
        : "";

    const unknownHtml = attendees.unnamedCount
        ? `<p class="empty-sub">
            ${attendees.unnamedCount}
            attendee${attendees.unnamedCount === 1 ? "" : "s"}
            has not chosen a public display name.
           </p>`
        : "";

    listEl.innerHTML =
        namesHtml ||
        unknownHtml ||
        `<p class="empty-sub">No attendees yet.</p>`;
}


/* ─── Toggle attendees ──────────────────────────────────── */
async function togglePhotowalkAttendees(event, photoWalkId) {
    event.stopPropagation();

    const listEl =
        document.getElementById(`attendees-${photoWalkId}`);

    const button =
        document.getElementById(`attendees-btn-${photoWalkId}`);

    if (!listEl || !button) return;

    const isOpen =
        !listEl.classList.contains("hidden");

    if (isOpen) {
        listEl.classList.add("hidden");
        button.textContent = "View attendees";
        return;
    }

    listEl.classList.remove("hidden");
    button.textContent = "Hide attendees";

    await renderPhotowalkAttendees(photoWalkId);
}


/* ─── Refresh attendees ─────────────────────────────────── */
async function refreshPhotowalkAttendees(photoWalkId) {
    const listEl =
        document.getElementById(`attendees-${photoWalkId}`);

    if (
        listEl &&
        !listEl.classList.contains("hidden")
    ) {
        await renderPhotowalkAttendees(photoWalkId);
    }

    const countEl =
        document.getElementById(`pw-count-${photoWalkId}`);

    if (countEl) {
        countEl.textContent =
            `${await fetchRSVPCount(photoWalkId)} attending`;
    }
}


/* ─── Render location cards ─────────────────────────────── */
function renderCards(matchingLocations) {

    const safetyClass = (safety) => {
        if (safety === "High") return "safety-high";
        if (safety === "Medium") return "safety-medium";
        return "safety-low";
    };

    if (matchingLocations.length === 0) {
        document.getElementById("results").innerHTML = `
            <div class="empty-state">
                <p>
                    No locations found.
                    Try searching Mumbai, Goa, Jaipur, or Varanasi.
                </p>
            </div>
        `;
        return;
    }

    document.getElementById("results").innerHTML = `
        <div class="results-header">
            <span class="results-title">Locations</span>
            <span class="results-count">
                ${matchingLocations.length} found
            </span>
        </div>

        <div class="cards-grid" id="cardsGrid"></div>
    `;

    const grid =
        document.getElementById("cardsGrid");

    const user =
        localStorage.getItem("sb_user");

    for (const location of matchingLocations) {

        const card =
            document.createElement("div");

        card.className = "location-card";

        card.innerHTML = `
            <div
                class="card-image-wrapper"
                style="cursor:pointer;"
                onclick="window.open(
                    'https://www.google.com/maps?q=${location.latitude},${location.longitude}',
                    '_blank'
                )"
            >
                <div class="card-image-placeholder"></div>
            </div>

            <div class="card-body">

                <span class="card-style-tag">
                    ${location.style}
                </span>

                <h3 class="card-name">
                    ${location.name}
                </h3>

                <p class="card-city">
                    ${location.city}
                </p>

                <p class="card-description">
                    ${location.description}
                </p>

                <div class="card-meta">

                    <div class="card-meta-item">
                        <span class="card-meta-label">
                            Best Time
                        </span>

                        <span class="card-meta-value">
                            ${location.bestTime}
                        </span>
                    </div>

                    <div class="card-meta-item">
                        <span class="card-meta-label">
                            Safety
                        </span>

                        <span class="card-meta-value ${safetyClass(location.safety)}">
                            ${location.safety}
                        </span>
                    </div>

                </div>

                <div class="card-actions">

                    <button
    class="action-btn maps-btn"
    onclick="window.open(
        'https://www.google.com/maps?q=${location.latitude},${location.longitude}',
        '_blank'
    )"
>
    <svg
        class="maps-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <path
            fill="#EA4335"
            d="M12 2C7.58 2 4 5.58 4 10c0 5.25 8 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8z"
        />
        <circle
            cx="12"
            cy="10"
            r="3.2"
            fill="#FFFFFF"
        />
    </svg>

    <span>Open in Maps</span>
</button>

                    ${
                        user
                            ? `
                                <button
                                    class="action-btn save-btn"
                                    id="save-btn-${location.id}"
                                    onclick="saveLocation(event,${location.id})"
                                >
                                    Save
                                </button>
                              `
                            : ""
                    }

                    ${
                        user
                            ? `
                                <button
                                    class="action-btn"
                                    onclick="openItineraryPicker(event,${location.id})"
                                >
                                    + Trip
                                </button>
                              `
                            : ""
                    }

                </div>

                <div
                    class="card-toggle"
                    onclick="togglePhotowalks(
                        event,
                        ${location.id},
                        this
                    )"
                >
                    <span
                        class="toggle-text"
                        id="toggle-label-${location.id}"
                    >
                        Photowalks · Loading...
                    </span>

                    <span class="toggle-icon">
                        ↓
                    </span>
                </div>

                <div
                    class="community hidden"
                    id="community-${location.id}"
                >

                    <div class="community-inner">

                        <div class="community-head">

                            <span class="community-heading">
                                Upcoming Photowalks
                            </span>

                            ${
                                user
                                    ? `
                                        <button
                                            class="action-btn"
                                            onclick="openHostForm(
                                                event,
                                                ${location.id}
                                            )"
                                        >
                                            Host a Photowalk
                                        </button>
                                      `
                                    : `
                                        <div class="community-guest-note">

                                            <span class="community-guest-title">
                                                Join the Photowalk community
                                            </span>

                                            <span class="community-guest-sub">
                                                Sign in to join this Photowalk,
                                                view attendees, or host your own.
                                            </span>

                                            <button
                                                class="action-btn community-signin-btn"
                                                onclick="openAuth()"
                                            >
                                                Sign In
                                            </button>

                                        </div>
                                      `
                            }

                        </div>

                        <div
                            id="photowalk-list-${location.id}"
                        >
                            <p class="empty-sub">
                                Loading...
                            </p>
                        </div>

                        <div
                            id="host-form-${location.id}"
                            class="hidden"
                        >
                            <div class="host-form">

                                <input
                                    class="form-input"
                                    type="text"
                                    placeholder="Title e.g. Golden Hour Walk"
                                    id="pw-title-${location.id}"
                                >

                                <input
                                    class="form-input"
                                    type="text"
                                    placeholder="Theme e.g. Street · Beginner"
                                    id="pw-theme-${location.id}"
                                >

                                <input
                                    class="form-input"
                                    type="date"
                                    id="pw-date-${location.id}"
                                >

                                <input
                                    class="form-input"
                                    type="time"
                                    id="pw-time-${location.id}"
                                >

                                <div
                                    style="
                                        display:flex;
                                        gap:8px;
                                        margin-top:8px;
                                    "
                                >

                                    <button
                                        class="action-btn"
                                        onclick="submitPhotowalk(
                                            event,
                                            ${location.id}
                                        )"
                                    >
                                        Confirm
                                    </button>

                                    <button
                                        class="action-btn"
                                        onclick="
                                            document
                                                .getElementById(
                                                    'host-form-${location.id}'
                                                )
                                                .classList
                                                .add('hidden')
                                        "
                                    >
                                        Cancel
                                    </button>

                                </div>

                            </div>
                        </div>

                    </div>
                </div>

            </div>
        `;

        grid.appendChild(card);


        /* Load photowalk count */
        fetchPhotowalks(location.id).then(pws => {

            const label =
                document.getElementById(
                    `toggle-label-${location.id}`
                );

            if (label) {
                label.textContent =
                    pws.length > 0
                        ? `Photowalks · ${pws.length} Upcoming`
                        : `Photowalks · None Scheduled`;
            }

        });


        /* Lazy load location image */
        const observer =
            new IntersectionObserver(
                (entries, obs) => {

                    entries.forEach(entry => {

                        if (entry.isIntersecting) {

                            obs.unobserve(entry.target);

                            const wrapper =
                                entry.target.querySelector(
                                    ".card-image-wrapper"
                                );

                            const resolveImage =
                                location.image_url
                                    ? Promise.resolve(
                                        location.image_url
                                      )
                                    : getUnsplashImage(
                                        location.name,
                                        location.city
                                      );

                            resolveImage.then(imageUrl => {

                                const img =
                                    imageUrl
                                        ? `
                                            <img
                                                class="card-image"
                                                src="${imageUrl}"
                                                alt="${location.name}"
                                                loading="lazy"
                                                style="cursor:pointer;"
                                                onclick="window.open(
                                                    'https://www.google.com/maps?q=${location.latitude},${location.longitude}',
                                                    '_blank'
                                                )"
                                            >
                                          `
                                        : `
                                            <div class="card-image-placeholder no-image"></div>
                                          `;

                                wrapper.innerHTML = img;
                            });
                        }
                    });

                },
                {
                    rootMargin: "200px"
                }
            );

        observer.observe(card);
    }
}


/* ─── Toggle photowalk section ──────────────────────────── */
async function togglePhotowalks(
    event,
    locationId,
    toggleEl
) {

    event.stopPropagation();

    const section =
        document.getElementById(
            `community-${locationId}`
        );

    const icon =
        toggleEl.querySelector(".toggle-icon");

    const isOpen =
        !section.classList.contains("hidden");

    if (isOpen) {
        section.classList.add("hidden");
        icon.style.transform = "";
        return;
    }

    section.classList.remove("hidden");
    icon.style.transform = "rotate(180deg)";

    const pws =
        await fetchPhotowalks(locationId);

    const listEl =
        document.getElementById(
            `photowalk-list-${locationId}`
        );

    const user =
        localStorage.getItem("sb_user");

    const currentUser =
        user ? JSON.parse(user) : null;

    if (pws.length === 0) {

        listEl.innerHTML = `
            <p class="empty-title">
                This location is waiting for its first photowalk.
            </p>

            <p class="empty-sub">
                Be the first to bring photographers together here.
            </p>
        `;

        return;
    }

    let html = "";

    for (const pw of pws) {

        const count =
            await fetchRSVPCount(pw.id);

        const date =
            new Date(pw.meetup_date);

        const month =
            date
                .toLocaleString(
                    "default",
                    { month: "short" }
                )
                .toUpperCase();

        const day =
            date.getDate();

        const alreadyRsvpd =
            currentUser
                ? await checkRSVP(
                    pw.id,
                    currentUser.id
                  )
                : false;

        const isOwner =
            currentUser &&
            pw.created_by === currentUser.id;

        html += `
            <div class="photowalk">

                <div class="pw-date">

                    <span class="pw-month">
                        ${month}
                    </span>

                    <span class="pw-day">
                        ${day}
                    </span>

                    <span class="pw-time">
                        ${pw.meetup_time}
                    </span>

                </div>

                <div class="pw-info">

                    <span class="pw-title">
                        ${pw.title}
                    </span>

                    ${
                        pw.theme
                            ? `
                                <span class="pw-theme">
                                    ${pw.theme}
                                </span>
                              `
                            : ""
                    }

                    <span
                        class="pw-meta"
                        id="pw-count-${pw.id}"
                    >
                        ${count} attending
                    </span>

                    ${
                        currentUser
                            ? `
                                <button
                                    class="action-btn"
                                    id="attendees-btn-${pw.id}"
                                    onclick="
                                        togglePhotowalkAttendees(
                                            event,
                                            ${pw.id}
                                        )
                                    "
                                >
                                    View attendees
                                </button>

                                <div
                                    class="attendees-list hidden"
                                    id="attendees-${pw.id}"
                                ></div>
                              `
                            : ""
                    }

                </div>

                <div
                    style="
                        display:flex;
                        flex-direction:column;
                        gap:6px;
                        align-items:flex-end;
                    "
                >

                    ${
                        currentUser && !isOwner
                            ? `
                                <button
                                    class="action-btn ${alreadyRsvpd ? "selected" : ""}"
                                    id="rsvp-btn-${pw.id}"
                                    onclick="
                                        toggleRSVP(
                                            event,
                                            ${pw.id},
                                            '${currentUser.id}',
                                            ${alreadyRsvpd}
                                        )
                                    "
                                >
                                    ${
                                        alreadyRsvpd
                                            ? "Joined"
                                            : "Join Photowalk"
                                    }
                                </button>
                              `
                            : ""
                    }

                    ${
                        isOwner
                            ? `
                                <button
                                    class="action-btn"
                                    onclick="
                                        deletePhotowalk(
                                            event,
                                            ${pw.id},
                                            ${locationId}
                                        )
                                    "
                                >
                                    Cancel
                                </button>
                              `
                            : ""
                    }

                </div>

            </div>
        `;
    }

    listEl.innerHTML = html;
}


/* ─── Format time ───────────────────────────────────────── */
function formatTime12Hour(time) {

    if (!time) return "";

    const parts =
        time.split(":");

    let hour =
        parseInt(parts[0], 10);

    const minute =
        parts[1] || "00";

    const suffix =
        hour >= 12 ? "PM" : "AM";

    hour =
        hour % 12 || 12;

    return `${hour}:${minute} ${suffix}`;
}


/* ─── Share photowalk ───────────────────────────────────── */
async function sharePhotowalk(
    event,
    photowalkId,
    encodedTitle
) {

    event.stopPropagation();

    const title =
        decodeURIComponent(encodedTitle);

    const shareUrl =
        `${window.location.origin}${window.location.pathname}?photowalk=${photowalkId}`;

    if (navigator.share) {

        try {

            await navigator.share({
                title: title,
                text: `Join this PhotoSpot photowalk: ${title}`,
                url: shareUrl
            });

        } catch (error) {
            console.log("Share cancelled.");
        }

        return;
    }

    try {

        await navigator.clipboard.writeText(
            shareUrl
        );

        alert("Photowalk link copied.");

    } catch (error) {

        prompt(
            "Copy this photowalk link:",
            shareUrl
        );
    }
}


/* ─── Open shared photowalk ─────────────────────────────── */
async function openSharedPhotowalk() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const photowalkId =
        params.get("photowalk");

    if (!photowalkId) return;

    try {

        const res =
            await fetch(
                `${SUPABASE_URL}/rest/v1/photowalks?id=eq.${photowalkId}&select=*`,
                {
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`
                    }
                }
            );

        const data =
            await res.json();

        if (!data.length) return;

        const pw =
            data[0];

        const resultsEl =
            document.getElementById("results");

        if (!resultsEl) return;

        resultsEl.innerHTML = `
            <div class="results-header">
                <span class="results-title">
                    Shared Photowalk
                </span>
            </div>

            <div class="community">
                <div class="community-inner">

                    <div class="photowalk">

                        <div class="pw-date">
                            <span class="pw-month">
                                ${new Date(pw.meetup_date)
                                    .toLocaleString(
                                        "default",
                                        { month: "short" }
                                    )
                                    .toUpperCase()}
                            </span>

                            <span class="pw-day">
                                ${new Date(pw.meetup_date).getDate()}
                            </span>

                            <span class="pw-time">
                                ${formatTime12Hour(pw.meetup_time)}
                            </span>
                        </div>

                        <div class="pw-info">

                            <span class="pw-title">
                                ${pw.title}
                            </span>

                            ${
                                pw.theme
                                    ? `
                                        <span class="pw-theme">
                                            ${pw.theme}
                                        </span>
                                      `
                                    : ""
                            }

                            <span
                                class="pw-meta"
                                id="shared-pw-count"
                            >
                                Loading attendees...
                            </span>

                        </div>

                    </div>

                    <div
                        style="
                            margin-top:16px;
                            display:flex;
                            gap:8px;
                            flex-wrap:wrap;
                        "
                    >

                        <button
                            class="action-btn"
                            onclick="window.history.replaceState(
                                {},
                                '',
                                window.location.pathname
                            ); showSelection();"
                        >
                            Browse Locations
                        </button>

                        <button
                            class="action-btn"
                            onclick="openAuth()"
                        >
                            Sign In
                        </button>

                    </div>

                </div>
            </div>
        `;

        const countEl =
            document.getElementById(
                "shared-pw-count"
            );

        if (countEl) {
            countEl.textContent =
                `${await fetchRSVPCount(pw.id)} attending`;
        }

    } catch (error) {

        console.warn(
            "Could not open shared photowalk:",
            error
        );
    }
}


/* ─── Check RSVP ────────────────────────────────────────── */
async function checkRSVP(
    photoWalkId,
    userId
) {

    const res =
        await fetch(
            `${SUPABASE_URL}/rest/v1/photowalk_rsvps?photowalk_id=eq.${photoWalkId}&user_id=eq.${userId}&select=id`,
            {
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`
                }
            }
        );

    const data =
        await res.json();

    return data.length > 0;
}


/* ─── Toggle RSVP ───────────────────────────────────────── */
async function toggleRSVP(
    event,
    photoWalkId,
    userId,
    alreadyJoined
) {

    event.stopPropagation();

    const token =
        localStorage.getItem("sb_token");

    if (!token) {
        openAuth();
        return;
    }

    const btn =
        event.target;

    if (alreadyJoined) {

        await fetch(
            `${SUPABASE_URL}/rest/v1/photowalk_rsvps?photowalk_id=eq.${photoWalkId}&user_id=eq.${userId}`,
            {
                method: "DELETE",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        btn.textContent =
            "Join Photowalk";

        btn.classList.remove(
            "selected"
        );

        btn.setAttribute(
            "onclick",
            `toggleRSVP(
                event,
                ${photoWalkId},
                '${userId}',
                false
            )`
        );

    } else {

        const res =
            await fetch(
                `${SUPABASE_URL}/rest/v1/photowalk_rsvps`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        photowalk_id: photoWalkId,
                        user_id: userId
                    })
                }
            );

        if (res.ok) {

            btn.textContent =
                "Joined";

            btn.classList.add(
                "selected"
            );

            btn.setAttribute(
                "onclick",
                `toggleRSVP(
                    event,
                    ${photoWalkId},
                    '${userId}',
                    true
                )`
            );

        }
    }

    await refreshPhotowalkAttendees(
        photoWalkId
    );
}


/* ─── Host form ─────────────────────────────────────────── */
async function openHostForm(
    event,
    locationId
) {

    event.stopPropagation();

    const profileReady =
        await ensureProfileForPhotowalk();

    if (!profileReady) return;

    const form =
        document.getElementById(
            `host-form-${locationId}`
        );

    if (form) {
        form.classList.remove(
            "hidden"
        );
    }
}


/* ─── Submit photowalk ──────────────────────────────────── */
async function submitPhotowalk(
    event,
    locationId
) {

    event.stopPropagation();

    const token =
        localStorage.getItem("sb_token");

    const userRaw =
        localStorage.getItem("sb_user");

    if (!token || !userRaw) {
        openAuth();
        return;
    }

    const user =
        JSON.parse(userRaw);

    const title =
        document.getElementById(
            `pw-title-${locationId}`
        ).value.trim();

    const theme =
        document.getElementById(
            `pw-theme-${locationId}`
        ).value.trim();

    const date =
        document.getElementById(
            `pw-date-${locationId}`
        ).value;

    const time =
        document.getElementById(
            `pw-time-${locationId}`
        ).value;

    if (!title || !date || !time) {
        alert(
            "Please enter a title, date, and time."
        );
        return;
    }

    const res =
        await fetch(
            `${SUPABASE_URL}/rest/v1/photowalks`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`,
                    "Prefer": "return=representation"
                },
                body: JSON.stringify({
                    location_id: locationId,
                    created_by: user.id,
                    title,
                    theme,
                    meetup_date: date,
                    meetup_time: time
                })
            }
        );

    if (!res.ok) {
        alert(
            "Could not create the photowalk."
        );
        return;
    }

    const form =
        document.getElementById(
            `host-form-${locationId}`
        );

    if (form) {
        form.classList.add(
            "hidden"
        );
    }

    await togglePhotowalks(
        {
            stopPropagation() {}
        },
        locationId,
        document.querySelector(
            `.card-toggle[onclick*="${locationId}"]`
        )
    );
}


/* ─── Delete photowalk ──────────────────────────────────── */
async function deletePhotowalk(
    event,
    photoWalkId,
    locationId
) {

    event.stopPropagation();

    const token =
        localStorage.getItem("sb_token");

    if (
        !confirm(
            "Cancel this photowalk?"
        )
    ) {
        return;
    }

    await fetch(
        `${SUPABASE_URL}/rest/v1/photowalks?id=eq.${photoWalkId}`,
        {
            method: "DELETE",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            }
        }
    );

    const section =
        document.getElementById(
            `community-${locationId}`
        );

    if (section) {
        section.classList.add(
            "hidden"
        );
    }

    const label =
        document.getElementById(
            `toggle-label-${locationId}`
        );

    if (label) {
        const pws =
            await fetchPhotowalks(
                locationId
            );

        label.textContent =
            pws.length > 0
                ? `Photowalks · ${pws.length} Upcoming`
                : `Photowalks · None Scheduled`;
    }
}


/* ─── Search / selection ────────────────────────────────── */
async function showSelection() {

    const locations =
        await fetchAllLocations();

    renderCards(locations);
}


/* ─── Authentication ───────────────────────────────────── */
function openAuth() {
    document
        .getElementById("authModal")
        .classList
        .remove("hidden");
}

function closeAuth() {
    document
        .getElementById("authModal")
        .classList
        .add("hidden");
}


/* ─── Sign up ───────────────────────────────────────────── */
async function signUp() {

    const email =
        document
            .getElementById("authEmail")
            .value
            .trim();

    const password =
        document
            .getElementById("authPassword")
            .value;

    const displayNameInput =
        document.getElementById(
            "authDisplayName"
        );

    const displayName =
        displayNameInput
            ? displayNameInput.value.trim()
            : "";

    if (!email || !password) {
        alert(
            "Please enter email and password."
        );
        return;
    }

    const res =
        await fetch(
            `${SUPABASE_URL}/auth/v1/signup`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY
                },
                body: JSON.stringify({
    email,
    password,
    data: {
        display_name: displayName
    }
})
            }
        );

    const data =
        await res.json();

    if (!res.ok) {
        alert(
            data.msg ||
            data.message ||
            "Could not sign up."
        );
        return;
    }

    if (data.access_token) {

        localStorage.setItem(
            "sb_token",
            data.access_token
        );

        localStorage.setItem(
            "sb_user",
            JSON.stringify(
                data.user
            )
        );

        if (displayName) {
            await saveProfile(
                data.user.id,
                displayName
            );
        }

        updateAuthUI(
            data.user
        );

        closeAuth();

        alert(
            "Account created successfully."
        );

    } else {

        alert(
            "Account created. Please check your email to confirm your account."
        );
    }
}


/* ─── Sign in ───────────────────────────────────────────── */
async function signIn() {

    const email =
        document
            .getElementById("authEmail")
            .value
            .trim();

    const password =
        document
            .getElementById("authPassword")
            .value;

    if (!email || !password) {
        alert(
            "Please enter email and password."
        );
        return;
    }

    const res =
        await fetch(
            `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY
                },
                body: JSON.stringify({
                    email,
                    password
                })
            }
        );

    const data =
        await res.json();

    if (!res.ok) {
        alert(
            data.error_description ||
            data.msg ||
            "Invalid login."
        );
        return;
    }

    localStorage.setItem(
        "sb_token",
        data.access_token
    );

    localStorage.setItem(
        "sb_user",
        JSON.stringify(
            data.user
        )
    );

    updateAuthUI(
        data.user
    );

    closeAuth();

    await showSelection();
}


/* ─── Auth UI ───────────────────────────────────────────── */
function updateAuthUI(user) {

    const btn =
        document.getElementById(
            "heroAuthBtn"
        );

    const savedBtn =
        document.getElementById(
            "savedBtn"
        );

    const itineraryBtn =
        document.getElementById(
            "itineraryNavBtn"
        );

    if (user) {

        btn.textContent =
            `${user.email.split("@")[0]} — Sign Out`;

        btn.onclick =
            signOut;

        savedBtn.classList.remove(
            "hidden"
        );

        itineraryBtn.classList.remove(
            "hidden"
        );

    } else {

        btn.textContent =
            "Sign In";

        btn.onclick =
            openAuth;

        savedBtn.classList.add(
            "hidden"
        );

        itineraryBtn.classList.add(
            "hidden"
        );
    }
}


/* ─── Sign out ──────────────────────────────────────────── */
function signOut() {

    localStorage.removeItem(
        "sb_token"
    );

    localStorage.removeItem(
        "sb_user"
    );

    updateAuthUI(
        null
    );

    showSelection();
}


/* ─── Escape HTML ───────────────────────────────────────── */
function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* ─── Profile setup ─────────────────────────────────────── */
function openProfileSetup() {

    document
        .getElementById("profileModal")
        .classList
        .remove("hidden");
}

function closeProfileSetup() {

    document
        .getElementById("profileModal")
        .classList
        .add("hidden");
}


/* ─── Check profile ─────────────────────────────────────── */
async function hasCurrentUserProfile() {

    const token =
        localStorage.getItem("sb_token");

    const userRaw =
        localStorage.getItem("sb_user");

    if (!token || !userRaw) {
        return false;
    }

    const user =
        JSON.parse(userRaw);

    const res =
        await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,display_name`,
            {
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

    if (!res.ok) return false;

    const rows =
        await res.json();

    return (
        rows.length > 0 &&
        !!rows[0].display_name
    );
}


/* ─── Ensure profile ────────────────────────────────────── */
async function ensureProfileForPhotowalk() {

    const hasProfile =
        await hasCurrentUserProfile();

    if (hasProfile) {
        return true;
    }

    openProfileSetup();
    return false;
}


/* ─── Save profile ──────────────────────────────────────── */
async function saveProfile(
    providedUserId = null,
    providedDisplayName = null
) {

    const token =
        localStorage.getItem("sb_token");

    const userRaw =
        localStorage.getItem("sb_user");

    const user =
        userRaw
            ? JSON.parse(userRaw)
            : null;

    const userId =
        providedUserId ||
        user?.id;

    const input =
        document.getElementById(
            "profileDisplayName"
        );

    const displayName =
        providedDisplayName ??
        (input
            ? input.value.trim()
            : "");

    if (!userId || !displayName) {
        alert(
            "Please enter a display name."
        );
        return false;
    }

    const res =
        await fetch(
            `${SUPABASE_URL}/rest/v1/profiles`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`,
                    "Prefer": "resolution=merge-duplicates"
                },
                body: JSON.stringify({
                    id: userId,
                    display_name: displayName
                })
            }
        );

    if (!res.ok) {
        alert(
            "Could not save your profile."
        );
        return false;
    }

    if (!providedDisplayName) {
        closeProfileSetup();
    }

    return true;
}


/* ─── Save / unsave location ────────────────────────────── */
async function saveLocation(
    event,
    locationId
) {

    event.stopPropagation();

    const token =
        localStorage.getItem("sb_token");

    const userRaw =
        localStorage.getItem("sb_user");

    if (!token || !userRaw) {
        openAuth();
        return;
    }

    const user =
        JSON.parse(userRaw);

    const btn =
        document.getElementById(
            `save-btn-${locationId}`
        );

    const existingRes =
        await fetch(
            `${SUPABASE_URL}/rest/v1/saved_locations?user_id=eq.${user.id}&location_id=eq.${locationId}&select=id`,
            {
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

    const existing =
        await existingRes.json();

    if (existing.length > 0) {

        await fetch(
            `${SUPABASE_URL}/rest/v1/saved_locations?id=eq.${existing[0].id}`,
            {
                method: "DELETE",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        btn.textContent =
            "Save";

        btn.classList.remove(
            "selected"
        );

        btn.setAttribute(
            "aria-pressed",
            "false"
        );

    } else {

        await fetch(
            `${SUPABASE_URL}/rest/v1/saved_locations`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`,
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify({
                    user_id: user.id,
                    location_id: locationId
                })
            }
        );

        btn.textContent =
            "Saved";

        btn.classList.add(
            "selected"
        );

        btn.setAttribute(
            "aria-pressed",
            "true"
        );
    }
}

function scrollToResults() {
    const results = document.getElementById("results");

    if (results) {
        requestAnimationFrame(() => {
            results.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }
}

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

        scrollToResults();
        return;
    }

    const allLocations = await fetchAllLocations();

    renderCards(
        allLocations.filter(l => ids.includes(l.id))
    );

    markSavedLocations();

    scrollToResults();
}


/* ─── Mark saved locations ──────────────────────────────── */
async function markSavedLocations() {

    const token =
        localStorage.getItem("sb_token");

    const userRaw =
        localStorage.getItem("sb_user");

    if (!token || !userRaw) return;

    const user =
        JSON.parse(userRaw);

    const res =
        await fetch(
            `${SUPABASE_URL}/rest/v1/saved_locations?user_id=eq.${user.id}&select=location_id`,
            {
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

    if (!res.ok) return;

    const rows =
        await res.json();

    rows.forEach(row => {

        const btn =
            document.getElementById(
                `save-btn-${row.location_id}`
            );

        if (btn) {

            btn.textContent =
                "Saved";

            btn.classList.add(
                "selected"
            );

            btn.setAttribute(
                "aria-pressed",
                "true"
            );
        }
    });
}


/* ─── Clear search ──────────────────────────────────────── */
function clearSearch() {

    const input =
        document.getElementById(
            "searchInput"
        );

    if (input) {
        input.value = "";
    }

    showSelection();
}


/* ─── Refresh token ─────────────────────────────────────── */
async function refreshToken() {

    const refresh =
        localStorage.getItem(
            "sb_refresh_token"
        );

    if (!refresh) return false;

    const res =
        await fetch(
            `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY
                },
                body: JSON.stringify({
                    refresh_token: refresh
                })
            }
        );

    if (!res.ok) return false;

    const data =
        await res.json();

    if (data.access_token) {

        localStorage.setItem(
            "sb_token",
            data.access_token
        );

        if (data.refresh_token) {
            localStorage.setItem(
                "sb_refresh_token",
                data.refresh_token
            );
        }

        if (data.user) {
            localStorage.setItem(
                "sb_user",
                JSON.stringify(
                    data.user
                )
            );
        }

        return true;
    }

    return false;
}


/* ─── Initial page load ─────────────────────────────────── */
window.addEventListener(
    "load",
    async () => {

        setHeroImage();

        const user =
            localStorage.getItem(
                "sb_user"
            );

        if (user) {
            updateAuthUI(
                JSON.parse(user)
            );
        } else {
            updateAuthUI(
                null
            );
        }

        const locations =
            await fetchAllLocations();

        const countEl =
            document.getElementById(
                "locationCount"
            );

        if (countEl) {
            countEl.textContent =
                `${locations.length}+ locations across India`;
        }

        await showSelection();

        await markSavedLocations();

        await openSharedPhotowalk();
    }
);


/* =========================================================
   ITINERARY SYSTEM
   ========================================================= */


/* ─── Fetch itineraries ─────────────────────────────────── */
async function fetchItineraries() {

    const token =
        localStorage.getItem("sb_token");

    const user =
        JSON.parse(
            localStorage.getItem("sb_user")
        );

    const res =
        await fetch(
            `${SUPABASE_URL}/rest/v1/itineraries?user_id=eq.${user.id}&order=created_at.desc`,
            {
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

    return await res.json();
}


/* ─── Fetch itinerary locations ─────────────────────────── */
async function fetchItineraryLocations(
    itineraryId
) {

    const token =
        localStorage.getItem("sb_token");

    const res =
        await fetch(
            `${SUPABASE_URL}/rest/v1/itinerary_locations?itinerary_id=eq.${itineraryId}&order=position.asc`,
            {
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                }
            }
        );

    return await res.json();
}


/* ─── Create itinerary ──────────────────────────────────── */
async function createItinerary() {

    const token =
        localStorage.getItem("sb_token");

    const user =
        JSON.parse(
            localStorage.getItem("sb_user")
        );

    const name =
        document
            .getElementById(
                "newItineraryName"
            )
            .value
            .trim();

    if (!name) {
        alert(
            "Please enter a trip name."
        );
        return;
    }

    await fetch(
        `${SUPABASE_URL}/rest/v1/itineraries`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                user_id: user.id,
                name
            })
        }
    );

    document
        .getElementById(
            "newItineraryName"
        )
        .value = "";

    await showItineraries();
}


/* ─── Delete itinerary ──────────────────────────────────── */
async function deleteItinerary(
    event,
    itineraryId
) {

    event.stopPropagation();

    const token =
        localStorage.getItem("sb_token");

    if (
        !confirm(
            "Delete this trip and all its saved locations?"
        )
    ) {
        return;
    }

    await fetch(
        `${SUPABASE_URL}/rest/v1/itineraries?id=eq.${itineraryId}`,
        {
            method: "DELETE",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            }
        }
    );

    await showItineraries();
}


/* ─── Pending itinerary location ────────────────────────── */
let pendingLocationId = null;


/* ─── Open itinerary picker ─────────────────────────────── */
async function openItineraryPicker(
    event,
    locationId
) {

    event.stopPropagation();

    const token =
        localStorage.getItem("sb_token");

    if (!token) {
        openAuth();
        return;
    }

    pendingLocationId =
        locationId;

    const itineraries =
        await fetchItineraries();

    const listEl =
        document.getElementById(
            "itineraryPickerList"
        );

    listEl.innerHTML =
        itineraries.length
            ? itineraries
                .map(it => `
                    <button
                        class="action-btn"
                        style="
                            width:100%;
                            margin-bottom:6px;
                        "
                        onclick="
                            addLocationToItinerary(
                                ${it.id},
                                ${pendingLocationId}
                            )
                        "
                    >
                        ${escapeHtml(it.name)}
                    </button>
                `)
                .join("")
            : `
                <p class="empty-sub">
                    No trips yet — create one below.
                </p>
              `;

    document
        .getElementById(
            "itineraryPickerModal"
        )
        .classList
        .remove("hidden");
}


/* ─── Close itinerary picker ────────────────────────────── */
function closeItineraryPicker() {

    document
        .getElementById(
            "itineraryPickerModal"
        )
        .classList
        .add("hidden");

    const input =
        document.getElementById(
            "newTripNameInline"
        );

    if (input) {
        input.value = "";
    }

    pendingLocationId =
        null;
}


/* ─── Create itinerary and add location ─────────────────── */
async function createItineraryAndAdd() {

    const token =
        localStorage.getItem("sb_token");

    const user =
        JSON.parse(
            localStorage.getItem("sb_user")
        );

    const name =
        document
            .getElementById(
                "newTripNameInline"
            )
            .value
            .trim();

    if (!name) {
        alert(
            "Please enter a trip name."
        );
        return;
    }

    const res =
        await fetch(
            `${SUPABASE_URL}/rest/v1/itineraries`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`,
                    "Prefer": "return=representation"
                },
                body: JSON.stringify({
                    user_id: user.id,
                    name
                })
            }
        );

    const created =
        await res.json();

    if (!created || !created.length) {
        alert(
            "Could not create the trip."
        );
        return;
    }

    await addLocationToItinerary(
        created[0].id,
        pendingLocationId
    );
}


/* ─── Add location to itinerary ─────────────────────────── */
async function addLocationToItinerary(
    itineraryId,
    locationId
) {

    const token =
        localStorage.getItem("sb_token");

    const existing =
        await fetchItineraryLocations(
            itineraryId
        );

    const nextPosition =
        existing.length
            ? Math.max(
                ...existing.map(
                    r => r.position
                )
              ) + 1
            : 0;

    await fetch(
        `${SUPABASE_URL}/rest/v1/itinerary_locations`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                itinerary_id: itineraryId,
                location_id: locationId,
                position: nextPosition
            })
        }
    );

    closeItineraryPicker();

    alert(
        "Added to itinerary."
    );
}


async function showItineraries() {
    const itineraries = await fetchItineraries();
    const resultsEl = document.getElementById("results");

    resultsEl.innerHTML = `
        <div class="results-header">
            <span class="results-title">My Itineraries</span>
        </div>

        <div class="host-form" style="max-width:320px;margin-bottom:24px;">
            <input
                class="form-input"
                type="text"
                id="newItineraryName"
                placeholder="New trip name e.g. Rajasthan Winter Trip"
            >

            <button
                class="action-btn"
                onclick="createItinerary()"
            >
                Create Trip
            </button>
        </div>

        <div
            id="itineraryListGrid"
            class="cards-grid"
        ></div>`;

    scrollToResults();

    const grid =
        document.getElementById(
            "itineraryListGrid"
        );

    if (itineraries.length === 0) {

        grid.innerHTML = `
            <p class="empty-sub">
                No trips yet. Create one above.
            </p>
        `;

        return;
    }

    grid.innerHTML =
        itineraries
            .map(it => `
                <div
                    class="location-card"
                    style="cursor:pointer;"
                    onclick="
                        openItinerary(
                            ${it.id},
                            '${String(it.name)
                                .replace(/'/g, "\\'")}'
                        )
                    "
                >

                    <div class="card-body">

                        <h3 class="card-name">
                            ${escapeHtml(it.name)}
                        </h3>

                        <p class="card-city">
                            Created
                            ${new Date(
                                it.created_at
                            ).toLocaleDateString()}
                        </p>

                        <div class="card-actions">

                            <button
                                class="action-btn"
                                onclick="
                                    deleteItinerary(
                                        event,
                                        ${it.id}
                                    )
                                "
                            >
                                Delete Trip
                            </button>

                        </div>

                    </div>

                </div>
            `)
            .join("");
}


/* ─── Open itinerary detail ─────────────────────────────── */
async function openItinerary(
    itineraryId,
    itineraryName
) {

    const rows =
        await fetchItineraryLocations(
            itineraryId
        );

    const allLocations =
        await fetchAllLocations();

    const resultsEl =
        document.getElementById(
            "results"
        );

    if (rows.length === 0) {

        resultsEl.innerHTML = `
            <div class="results-header">
                <span class="results-title">
                    ${escapeHtml(itineraryName)}
                </span>
            </div>

            <p class="empty-sub">
                No locations added yet.
                Go add some from the search results.
            </p>

            <button
                class="action-btn"
                style="
                    max-width:160px;
                    margin-top:12px;
                "
                onclick="showItineraries()"
            >
                ← Back to Trips
            </button>
        `;

        return;
    }

    const orderedRows =
        rows.sort(
            (a, b) =>
                a.position - b.position
        );

    const itemsHtml =
        orderedRows
            .map((row, idx) => {

                const loc =
                    allLocations.find(
                        l =>
                            l.id ===
                            row.location_id
                    );

                if (!loc) return "";

                return `
                    <div
                        class="photowalk"
                        id="itin-row-${row.id}"
                    >

                        <div class="pw-date">

                            <span class="pw-day">
                                ${idx + 1}
                            </span>

                        </div>

                        <div class="pw-info">

                            <span class="pw-title">
                                ${escapeHtml(loc.name)}
                            </span>

                            <span class="pw-theme">
                                ${escapeHtml(loc.city)}
                                ·
                                ${escapeHtml(loc.style)}
                            </span>

                        </div>

                        <div
                            style="
                                display:flex;
                                flex-direction:column;
                                gap:6px;
                                align-items:flex-end;
                            "
                        >

                            <div
                                style="
                                    display:flex;
                                    gap:4px;
                                "
                            >

                                ${
                                    idx > 0
                                        ? `
                                            <button
                                                class="action-btn"
                                                onclick="
                                                    moveItineraryLocation(
                                                        ${itineraryId},
                                                        ${row.id},
                                                        'up'
                                                    )
                                                "
                                            >
                                                ↑
                                            </button>
                                          `
                                        : ""
                                }

                                ${
                                    idx <
                                    orderedRows.length - 1
                                        ? `
                                            <button
                                                class="action-btn"
                                                onclick="
                                                    moveItineraryLocation(
                                                        ${itineraryId},
                                                        ${row.id},
                                                        'down'
                                                    )
                                                "
                                            >
                                                ↓
                                            </button>
                                          `
                                        : ""
                                }

                            </div>

                            <button
                                class="action-btn"
                                onclick="
                                    removeLocationFromItinerary(
                                        ${itineraryId},
                                        ${row.id}
                                    )
                                "
                            >
                                Remove
                            </button>

                        </div>

                    </div>
                `;
            })
            .join("");

    resultsEl.innerHTML = `
        <div class="results-header">
            <span class="results-title">
                ${escapeHtml(itineraryName)}
            </span>
        </div>

        <div
            class="community"
            style="border-top:none;"
        >

            <div class="community-inner">
                ${itemsHtml}
            </div>

        </div>

        <button
            class="action-btn"
            style="
                max-width:160px;
                margin-top:16px;
            "
            onclick="showItineraries()"
        >
            ← Back to Trips
        </button>
    `;
}


/* ─── Remove location from itinerary ────────────────────── */
async function removeLocationFromItinerary(
    itineraryId,
    rowId
) {

    const token =
        localStorage.getItem(
            "sb_token"
        );

    await fetch(
        `${SUPABASE_URL}/rest/v1/itinerary_locations?id=eq.${rowId}`,
        {
            method: "DELETE",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${token}`
            }
        }
    );

    const row =
        document.getElementById(
            `itin-row-${rowId}`
        );

    if (row) {

        const nameEl =
            document.querySelector(
                ".results-title"
            );

        await openItinerary(
            itineraryId,
            nameEl
                ? nameEl.textContent
                : "Itinerary"
        );
    }
}


/* ─── Move itinerary location ───────────────────────────── */
async function moveItineraryLocation(
    itineraryId,
    rowId,
    direction
) {

    const token =
        localStorage.getItem(
            "sb_token"
        );

    const rows =
        (
            await fetchItineraryLocations(
                itineraryId
            )
        ).sort(
            (a, b) =>
                a.position - b.position
        );

    const idx =
        rows.findIndex(
            r =>
                r.id === rowId
        );

    const swapIdx =
        direction === "up"
            ? idx - 1
            : idx + 1;

    if (
        swapIdx < 0 ||
        swapIdx >= rows.length
    ) {
        return;
    }

    const a =
        rows[idx];

    const b =
        rows[swapIdx];

    await Promise.all([

        fetch(
            `${SUPABASE_URL}/rest/v1/itinerary_locations?id=eq.${a.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    position: b.position
                })
            }
        ),

        fetch(
            `${SUPABASE_URL}/rest/v1/itinerary_locations?id=eq.${b.id}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    position: a.position
                })
            }
        )
    ]);

    const nameEl =
        document.querySelector(
            ".results-title"
        );

    await openItinerary(
        itineraryId,
        nameEl
            ? nameEl.textContent
            : "Itinerary"
    );
}