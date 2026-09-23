export const WheelState = {
  MOVING: "MOVING",
  DECELERATING: "DECELERATING",
  STOPPED: "STOPPED"
};

const PALETTE = [
    "#f87171", 
    "#fb923c", 
    "#fbbf24", 
    "#aed334", 
    "#e56d17", 
    "#d2f553", 
    "#f9a75f", 
    "#faf338"
  ];

export class RouletteWheel {
  constructor(canvas, onActiveChange, onStop, onStart) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onActiveChange = onActiveChange;
    this.onStop = onStop;
    this.onStart = onStart;

    this.restaurants = [];
    this.currentLang = "zh_CN";
    this.state = WheelState.MOVING;

    this.angle = 0;
    this.cruiseVelocity = 0.045;
    this.currentVelocity = 0.045;
    this.friction = 0.985; // Deceleration damping factor
    this.lastActiveId = null;

    this.canvas.addEventListener("click", () => this.toggleState());
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setData(restaurants, lang) {
    this.restaurants = Array.isArray(restaurants) ? restaurants : [];
    this.currentLang = lang;
    this.lastActiveId = null;
    this.state = this.restaurants.length ? WheelState.MOVING : WheelState.STOPPED;
    this.currentVelocity = this.restaurants.length ? this.cruiseVelocity : 0;
    this.draw();
  }

  setLanguage(lang) {
    this.currentLang = lang;
    this.draw();
  }

  toggleState() {
    if (!this.restaurants.length) return;

    if (this.state === WheelState.MOVING) {
      this.state = WheelState.DECELERATING;
    } else if (this.state === WheelState.STOPPED) {
      this.currentVelocity = this.cruiseVelocity;
      this.state = WheelState.MOVING;
      if (this.onStart) this.onStart();
    }
  }

  animate() {
    if (this.state === WheelState.MOVING) {
      this.angle += this.currentVelocity;
    } else if (this.state === WheelState.DECELERATING) {
      this.angle += this.currentVelocity;
      this.currentVelocity *= this.friction;

      if (this.currentVelocity < 0.0008) {
        this.currentVelocity = 0;
        this.state = WheelState.STOPPED;
        const winner = this.getActiveRestaurant();
        if (winner && this.onStop) this.onStop(winner);
      }
    }

    this.draw();
    this.checkActiveSlice();
    requestAnimationFrame(this.animate);
  }

  checkActiveSlice() {
    const active = this.getActiveRestaurant();
    if (active && active.id !== this.lastActiveId) {
      this.lastActiveId = active.id;
      if (this.onActiveChange) this.onActiveChange(active);
    }
  }

  getActiveRestaurant() {
    if (!this.restaurants.length) return null;
    const arc = (2 * Math.PI) / this.restaurants.length;
    // Pointer fixed at 3*PI/2 (top center)
    const normalizedAngle = (this.angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const pointerAngle = (3 * Math.PI / 2 - normalizedAngle + 2 * Math.PI) % (2 * Math.PI);
    const index = Math.floor(pointerAngle / arc) % this.restaurants.length;
    return this.restaurants[index];
  }

  draw() {
    const { width, height } = this.canvas;
    const radius = width / 2;
    this.ctx.clearRect(0, 0, width, height);

    if (!this.restaurants.length) return;

    const numSlices = this.restaurants.length;
    const arc = (2 * Math.PI) / numSlices;

    this.restaurants.forEach((r, i) => {
      const sliceAngle = this.angle + i * arc;
      this.ctx.beginPath();
      this.ctx.fillStyle = PALETTE[i % PALETTE.length];
      this.ctx.moveTo(radius, radius);
      this.ctx.arc(radius, radius, radius - 8, sliceAngle, sliceAngle + arc);
      this.ctx.fill();
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = "#0f172a";
      this.ctx.stroke();

      // Draw restaurant label
      this.ctx.save();
      this.ctx.translate(radius, radius);
      this.ctx.rotate(sliceAngle + arc / 2);
      this.ctx.textAlign = "right";
      this.ctx.fillStyle = "#1e293b";
      this.ctx.font = "bold 13px system-ui";
      
      const name = (this.currentLang === "zh_CN" && r.name_zh) ? r.name_zh : r.name_en;
      const truncated = name.length > 18 ? name.slice(0, 16) + "…" : name;
      this.ctx.fillText(truncated, radius - 20, 5);
      this.ctx.restore();
    });
  }
}