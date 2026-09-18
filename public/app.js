const canvas = document.getElementById("roulette");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spin-btn");
const filterSelect = document.getElementById("filter-select");

const modal = document.getElementById("result-modal");
const resultName = document.getElementById("result-name");
const resultRating = document.getElementById("result-rating");
const resultAddress = document.getElementById("result-address");
const resultMapsLink = document.getElementById("result-maps-link");
const closeModal = document.getElementById("close-modal");

let restaurants = [];
let currentAngle = 0;
let isSpinning = false;

const PALETTE = [
  "#f87171", "#fb923c", "#fbbf24", "#34d399",
  "#22d3ee", "#818cf8", "#c084fc", "#f472b6"
];

async function loadRestaurants() {
  const municipality = filterSelect.value;
  try {
    const res = await fetch(`/api/restaurants?municipality=${encodeURIComponent(municipality)}`);
    restaurants = await res.json();
    drawWheel();
  } catch (err) {
    console.error("Failed to load restaurants:", err);
  }
}

function drawWheel() {
  const numSlices = restaurants.length;
  const radius = canvas.width / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (numSlices === 0) {
    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText("No restaurants found", radius, radius);
    return;
  }

  const arc = (2 * Math.PI) / numSlices;

  restaurants.forEach((r, i) => {
    const angle = currentAngle + i * arc;
    ctx.beginPath();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.moveTo(radius, radius);
    ctx.arc(radius, radius, radius - 8, angle, angle + arc);
    ctx.fill();
    ctx.stroke();

    // Draw truncated label
    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(angle + arc / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 13px system-ui";
    const label = r.name.length > 18 ? r.name.substring(0, 16) + "…" : r.name;
    ctx.fillText(label, radius - 20, 5);
    ctx.restore();
  });
}

function spin() {
  if (isSpinning || restaurants.length === 0) return;
  isSpinning = true;
  spinBtn.disabled = true;

  const spinRounds = 5 + Math.random() * 5; // 5 to 10 full rotations
  const totalRotation = spinRounds * 2 * Math.PI + Math.random() * (2 * Math.PI);
  const duration = 4000; // 4 seconds
  const startTimestamp = performance.now();
  const initialAngle = currentAngle;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animate(now) {
    const elapsed = now - startTimestamp;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);

    currentAngle = initialAngle + totalRotation * easedProgress;
    drawWheel();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      isSpinning = false;
      spinBtn.disabled = false;
      determineWinner();
    }
  }

  requestAnimationFrame(animate);
}

function determineWinner() {
  const numSlices = restaurants.length;
  const arc = (2 * Math.PI) / numSlices;
  
  // Normalize angle to [0, 2PI)
  const normalizedAngle = (currentAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  
  // The pointer is stationary at top center (3 * Math.PI / 2 radians)
  const pointerAngle = (3 * Math.PI / 2 - normalizedAngle + 2 * Math.PI) % (2 * Math.PI);
  const winningIndex = Math.floor(pointerAngle / arc) % numSlices;
  const winner = restaurants[winningIndex];

  resultName.textContent = winner.name;
  resultRating.textContent = `★ ${winner.rating || "N/A"}`;
  resultAddress.textContent = winner.address;
  resultMapsLink.href = winner.google_maps_uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(winner.name)}`;

  modal.classList.remove("hidden");
}

filterSelect.addEventListener("change", loadRestaurants);
spinBtn.addEventListener("click", spin);
closeModal.addEventListener("click", () => modal.classList.add("hidden"));

// Initial Load
loadRestaurants();