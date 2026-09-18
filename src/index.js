// Key search coordinates across York Region to sample a wide set of places
const REGIONAL_NODES = [
  { municipality: "Richmond Hill", lat: 43.8931, lng: -79.4206 },
  { municipality: "Markham", lat: 43.8834, lng: -79.2917 },
  { municipality: "Vaughan", lat: 43.8383, lng: -79.5620 },
  { municipality: "Aurora", lat: 43.9995, lng: -79.4430 },
  { municipality: "Newmarket", lat: 44.0509, lng: -79.4558 },
  { municipality: "Whitchurch-Stouffville", lat: 43.9717, lng: -79.2514 }
];

export default {
  // Handles HTTP API calls
  async fetch(request, env) {
    const url = new URL(request.url);

    // API route: Fetch restaurants for the wheel
    if (url.pathname === "/api/restaurants") {
      const municipality = url.searchParams.get("municipality");
      
      let query = "SELECT * FROM restaurants";
      let params = [];

      if (municipality && municipality !== "All") {
        query += " WHERE municipality = ?";
        params.push(municipality);
      }
      query += " ORDER BY RANDOM() LIMIT 80"; // Limit to 80 max for smooth wheel partition rendering

      const { results } = await env.york_region_restaurants_db.prepare(query).bind(...params).all();
      return Response.json(results, {
        headers: { "Cache-Control": "public, max-age=300" }
      });
    }

    // Manual sync endpoint for testing (protected by auth token or dev mode)
    if (url.pathname === "/api/sync" && request.method === "POST") {
      const count = await syncGooglePlaces(env);
      return Response.json({ status: "ok", recordsUpdated: count });
    }

    // Fall back to Cloudflare static asset handling
    return env.ASSETS.fetch(request);
  },

  // Handles scheduled cron updates
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncGooglePlaces(env));
  }
};

// Google Places API (New) - searchNearby
async function syncGooglePlaces(env) {
  console.log("Starting Google Places sync...");
  console.log("API key present: ", Boolean(env.GOOGLE_MAPS_API_KEY));
  let totalSaved = 0;

  for (const node of REGIONAL_NODES) {
    const endpoint = "https://places.googleapis.com/v1/places:searchNearby";
    const payload = {
      includedTypes: ["restaurant"],
      maxResultCount: 15,
      locationRestriction: {
        circle: {
          center: { latitude: node.lat, longitude: node.lng },
          radius: 7000.0 // 7 km radius around each node
        }
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(10000), // 10-second timeout for the request
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
          // Use FieldMask to only retrieve fields you need (minimizes API costs)
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.googleMapsUri"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error(`Google Places API error for ${node.municipality}:`, await response.text());
        continue;
      }

      const data = await response.json();
      console.log(`[DEBUG] Google response for ${node.municipality}:`, JSON.stringify(data));
      const places = data.places || [];

      // Upsert places into D1
      const statement = env.york_region_restaurants_db.prepare(`
        INSERT INTO restaurants (id, name, address, rating, municipality, google_maps_uri, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          address = excluded.address,
          rating = excluded.rating,
          google_maps_uri = excluded.google_maps_uri,
          updated_at = CURRENT_TIMESTAMP
      `);

      const batch = places.map(p => 
        statement.bind(
          p.id,
          p.displayName?.text || "Unknown Name",
          p.formattedAddress || "",
          p.rating || 0.0,
          node.municipality,
          p.googleMapsUri || ""
        )
      );

      if (batch.length > 0) {
        await env.york_region_restaurants_db.batch(batch);
        totalSaved += batch.length;
      }
    } catch (err) {
      console.error(`Sync failure on node ${node.municipality}:`, err);
    }
  }

  return totalSaved;
}