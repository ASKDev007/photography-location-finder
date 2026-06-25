async function showSelection() {

    let searchText = document
        .getElementById("searchInput")
        .value
        .toLowerCase();

    let response = await fetch("locations.json");

    let locations = await response.json();

    let matchingLocations = locations.filter(location => {

        return (
            location.style.toLowerCase().includes(searchText) ||
            location.city.toLowerCase().includes(searchText) ||
            location.description.toLowerCase().includes(searchText)
        );

    });

    let output = `
<h2>Recommended Locations</h2>
<p>${matchingLocations.length} location(s) found</p>
`;

    if (matchingLocations.length === 0) {
        output += "<p>No matching locations found.</p>";
    }

    matchingLocations.forEach(location => {

        output += `
        <div class="location-card">
            <h3>${location.name}</h3>
            <p><strong>City:</strong> ${location.city}</p>
            <p><strong>Best Time:</strong> ${location.bestTime}</p>
            <p><strong>Safety:</strong> ${location.safety}</p>
            <p>${location.description}</p>
        </div>
        `;
    });

    document.getElementById("results").innerHTML = output;
}

function clearSearch() {

    document.getElementById("searchInput").value = "";

    document.getElementById("results").innerHTML = "";

}