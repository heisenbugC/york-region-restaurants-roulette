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
    if (url.pathname.endsWith("/api/restaurants")) {
      const municipality = url.searchParams.get("municipality");
      
      let query = "SELECT * FROM restaurants";
      let params = [];

      if (municipality && municipality !== "All") {
        query += " WHERE municipality = ?";
        params.push(municipality);
      }
      query += " ORDER BY RANDOM() LIMIT 120"; // Limit to 120 max for smooth wheel partition rendering

      try {
        const { results } = await env.york_region_restaurants_db.prepare(query).bind(...params).all();
        return Response.json(results, {
          headers: { "Cache-Control": "public, max-age=300" }
        });
      } catch (err) {
        console.error("Restaurant query failed:", err);
        return Response.json({ error: "Unable to load restaurants" }, { status: 500 });
      }
    }

    if (url.pathname.endsWith("/api/restaurant-details")) {
      const placeId = url.searchParams.get("id");

      if (!placeId) return new Response("Missing place ID", { status: 400 });

      const endpoint = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

      const fieldMask = [
        "id",
        "displayName",
        "formattedAddress",
        "rating",
        "userRatingCount",
        "regularOpeningHours",
        "photos",
        "websiteUri",
        "location",
        "nationalPhoneNumber",
        "reviews"
      ].join(",");

      try {
        const response = await fetch(endpoint, {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": fieldMask,
            "Accept-Language": "zh-CN,en"
          }
        });

        if (!response.ok) {
          return new Response(
            await response.text(),
            { status: response.status }
          );
        }

        const data = await response.json();

        let photoUrl = null;
        if (data.photos && data.photos.length > 0) {
          const photoRef = data.photos[0].displayName;
          photoUrl = `https://places.googleapis.com/v1/${photoRef}/media?maxHeightPx=600&maxWidthPx=800&key=${env.GOOGLE_MAPS_API_KEY}`;;
        } else if (data.location?.latitude && data.location?.longitude) {
          photoUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${data.location.latitude},${data.location.longitude}&key=${env.GOOGLE_MAPS_API_KEY}`;
        }

        return Response.json({ ...data, photoUrl }, {
          headers: { "Cache-Control": "public, max-age=86400" }
        });

      } catch (err) {
        return new Response(err.message, { status: 500 });
      }
    }

    if (url.pathname.endsWith("/api/sync") && request.method === "POST") {
      const isLocalRequest = ["localhost", "127.0.0.1"].includes(url.hostname);
      const syncToken = env.SYNC_TOKEN;

      if (!syncToken && !isLocalRequest) {
        return Response.json({ error: "Sync is not configured" }, { status: 503 });
      }

      if (syncToken || !isLocalRequest) {
        const authorization = request.headers.get("Authorization") || "";
        const suppliedToken = authorization.startsWith("Bearer ")
          ? authorization.slice(7)
          : "";
        if (!suppliedToken || !(await tokensMatch(suppliedToken, syncToken))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
      }

      if (!env.GOOGLE_MAPS_API_KEY) {
        return Response.json({ error: "Google Places sync is not configured" }, { status: 503 });
      }

      const count = await syncGooglePlaces(env);
      return Response.json({ status: "ok", recordsUpdated: count });
    }

    if (url.pathname === "/roulette" || url.pathname.startsWith("/roulette/")) {
      return env.ROULETTE_SERVICE.fetch(request); 
    }

/*     if (url.pathname.startsWith("/roulette/")) {
      const strippedPath = url.pathname.replace(/^\/roulette/, "") || "/";
      const assetUrl = new URL(request.url);
      assetUrl.pathname = strippedPath;
      // Fetch from assets with stripped path
      const assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));

      // SPA Fallback: if a sub-route is not a direct file, serve index.html
      if (assetResponse.status === 404) {
        assetUrl.pathname = "/index.html";
        return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      }

      return assetResponse;
    } */

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
  let totalSaved = 0;

  for (const node of REGIONAL_NODES) {
    const endpoint = "https://places.googleapis.com/v1/places:searchText";
    const payload = {
      textQuery: "Chinese restaurant",
      maxResultCount: 60,
      languageCode: "zh-CN",
      locationBias: {
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
      const places = data.places || [];
  console.log(`Google response for ${node.municipality} received with ${places.length} places.`);

      // Upsert places into D1
      const statement = env.york_region_restaurants_db.prepare(`
        INSERT INTO restaurants (id, name_en, name_zh, address, rating, municipality, google_maps_uri, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name_en = excluded.name_en,
          name_zh = excluded.name_zh,
          address = excluded.address,
          rating = excluded.rating,
          google_maps_uri = excluded.google_maps_uri,
          updated_at = CURRENT_TIMESTAMP
      `);

      const batch = places.map(p => 
        statement.bind(
          p.id,
          p.displayName?.text || "Unknown Name",
          p.displayName?.text || "未知名称",
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

async function tokensMatch(suppliedToken, expectedToken) {
  if (!expectedToken) return false;

  const [suppliedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(suppliedToken)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expectedToken))
  ]);
  const suppliedBytes = new Uint8Array(suppliedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = suppliedBytes.length ^ expectedBytes.length;

  for (let index = 0; index < suppliedBytes.length; index += 1) {
    difference |= suppliedBytes[index] ^ (expectedBytes[index] || 0);
  }

  return difference === 0;
}