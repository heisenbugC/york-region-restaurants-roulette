export class DetailPanel {
  constructor(panelElement, i18n) {
    this.el = panelElement;
    this.i18n = i18n;

    // Element bindings
    this.titleEl = panelElement.querySelector("#panel-title");
    this.ratingBadgeEl = panelElement.querySelector("#panel-rating-badge");
    this.heroPhotoEl = panelElement.querySelector("#panel-hero-photo");
    this.mapsFrameEl = panelElement.querySelector("#panel-maps-frame");
    this.addressEl = panelElement.querySelector("#panel-address");
    this.phoneEl = panelElement.querySelector("#panel-phone");
    this.rowPhone = panelElement.querySelector("#row-phone");
    this.websiteEl = panelElement.querySelector("#panel-website");
    this.rowWebsite = panelElement.querySelector("#row-website");
    this.hoursListEl = panelElement.querySelector("#panel-hours-list");
    this.summaryScoreEl = panelElement.querySelector("#summary-score");
    this.summaryCountEl = panelElement.querySelector("#summary-count");
    this.ratingBarsEl = panelElement.querySelector("#rating-breakdown");
    this.reviewsContainerEl = panelElement.querySelector("#reviews-container");
  }

  async show(basicRestaurant) {
    const isZh = this.i18n.currentLang === "zh_CN";
    const displayName = (isZh && basicRestaurant.name_zh) ? basicRestaurant.name_zh : basicRestaurant.name_en;

    // Initial placeholder while fetching
    this.titleEl.textContent = displayName;
    this.ratingBadgeEl.textContent = `★ ${basicRestaurant.rating || "N/A"}`;
    this.addressEl.textContent = basicRestaurant.address || "";

    // Load iframe map immediately
    const query = encodeURIComponent(`${basicRestaurant.name_en}, ${basicRestaurant.address}`);
    this.mapsFrameEl.src = `https://maps.google.com/maps?q=${query}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

    // Fetch deep details on demand
    try {
      const res = await fetch(`./api/restaurant-details?id=${encodeURIComponent(basicRestaurant.id)}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      const data = await res.json();
      this.renderFullDetails(data);
    } catch (err) {
      console.error("Error loading restaurant details:", err);
    }
  }

  renderFullDetails(data) {
    // 1. Photo (Gallery first, fallback to Streetview via backend)
    if (data.heroPhotoUrl) {
      this.heroPhotoEl.src = data.heroPhotoUrl;
      this.heroPhotoEl.style.display = "block";
    } else {
      this.heroPhotoEl.style.display = "none";
    }

    // 2. Phone
    if (data.nationalPhoneNumber) {
      this.rowPhone.style.display = "flex";
      this.phoneEl.textContent = data.nationalPhoneNumber;
      this.phoneEl.href = `tel:${data.nationalPhoneNumber}`;
    } else {
      this.rowPhone.style.display = "none";
    }

    // 3. Website
    if (data.websiteUri) {
      this.rowWebsite.style.display = "flex";
      this.websiteEl.href = data.websiteUri;
    } else {
      this.rowWebsite.style.display = "none";
    }

    // 4. Opening Hours (by day of week)
    this.hoursListEl.innerHTML = "";
    const weekdayDescriptions = data.regularOpeningHours?.weekdayDescriptions || [];
    if (weekdayDescriptions.length > 0) {
      weekdayDescriptions.forEach(desc => {
        const li = document.createElement("li");
        li.textContent = desc;
        this.hoursListEl.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "Hours not available";
      this.hoursListEl.appendChild(li);
    }

    // 5. Review Summary & Distribution
    const rating = data.rating || 0;
    const totalReviews = data.userRatingCount || (data.reviews?.length || 0);
    this.summaryScoreEl.textContent = rating.toFixed(1);
    this.summaryCountEl.textContent = `${totalReviews} reviews`;

    // Calculate rating counts from available reviews
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    (data.reviews || []).forEach(r => {
      const star = Math.round(r.rating || 5);
      if (distribution[star] !== undefined) distribution[star]++;
    });

    const reviewsCountSample = data.reviews?.length || 1;
    this.ratingBarsEl.innerHTML = "";
    [5, 4, 3, 2, 1].forEach(star => {
      const count = distribution[star];
      const pct = Math.round((count / reviewsCountSample) * 100);
      const row = document.createElement("div");
      row.className = "rating-bar-row";
      row.innerHTML = `
        <span>${star}★</span>
        <div class="bar-bg"><div class="bar-fill" style="width: ${pct}%"></div></div>
        <span>${count}</span>
      `;
      this.ratingBarsEl.appendChild(row);
    });

    // 6. Latest 10 Reviews
    this.reviewsContainerEl.innerHTML = "";
    const reviews = (data.reviews || []).slice(0, 10);
    if (reviews.length === 0) {
      this.reviewsContainerEl.innerHTML = `<p class="review-text">No reviews found.</p>`;
      return;
    }

    reviews.forEach(rev => {
      const card = document.createElement("div");
      card.className = "review-card";
      const stars = "★".repeat(Math.round(rev.rating || 5));
      const author = rev.authorAttribution?.displayName || "Anonymous";
      const text = rev.text?.text || rev.originalText?.text || "";
      const time = rev.relativePublishTimeDescription || "";

      card.innerHTML = `
        <div class="review-header">
          <span class="reviewer-name">${author}</span>
          <span class="review-stars">${stars}</span>
        </div>
        <p class="review-text">${text}</p>
        <span class="review-time">${time}</span>
      `;
      this.reviewsContainerEl.appendChild(card);
    });
  }
}