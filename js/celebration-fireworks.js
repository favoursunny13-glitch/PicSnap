"use strict";

const startCelebrationFireworks = (() => {
  const cycleSeconds = 5;
  const launchSeconds = 0.84;
  const secondaryDelay = 0.53;
  const gold = "#ffcd73";
  const fullCircle = Math.PI * 2;
  const bursts = [
    { delay: 0, x: 0.10, y: 0.56, size: 0.19, color: "#ff78ae" },
    { delay: 0.31, x: 0.22, y: 0.37, size: 0.21, color: "#b888ff" },
    { delay: 0.66, x: 0.17, y: 0.72, size: 0.16, color: "#ffc464" },
    { delay: 2.08, x: 0.13, y: 0.29, size: 0.18, color: "#f4a0ff" },
    { delay: 2.42, x: 0.25, y: 0.60, size: 0.21, color: "#ff9bb0" },
    { delay: 2.77, x: 0.09, y: 0.66, size: 0.19, color: "#ffda85" },
    { delay: 3.25, x: 0.23, y: 0.25, size: 0.18, color: "#c2a0ff" },
    { delay: 3.59, x: 0.12, y: 0.44, size: 0.20, color: "#ff95c8" },
    { delay: 3.92, x: 0.24, y: 0.66, size: 0.17, color: "#ffd087" },
  ];

  const random = (min, max) => min + Math.random() * (max - min);

  function makeSparks(count, minSpeed, maxSpeed) {
    const offset = random(0, fullCircle);
    return Array.from({ length: count }, (_, index) => {
      const angle = offset + (index + random(-0.36, 0.36)) * fullCircle / count;
      const speed = random(minSpeed, maxSpeed);
      return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    });
  }

  function drawGlow(context, sprite, x, y, size, opacity) {
    context.globalAlpha = opacity;
    if (sprite.complete && sprite.naturalWidth > 0) {
      context.drawImage(sprite, x - size, y - size, size * 2, size * 2);
      return;
    }
    const glow = context.createRadialGradient(x, y, 0, x, y, size * 0.47);
    glow.addColorStop(0, "#fff7df");
    glow.addColorStop(0.24, gold);
    glow.addColorStop(1, "#ffc46400");
    context.fillStyle = glow;
    context.fillRect(x - size, y - size, size * 2, size * 2);
  }

  function drawTrails(context, sparks, x, y, size, age, fade, color) {
    const travel = 1 - Math.exp(-2.5 * age);
    const tailAge = Math.max(0, age - 0.14);
    const tailTravel = 1 - Math.exp(-2.5 * tailAge);
    const drop = 0.36 * size * age * age;
    const tailDrop = 0.36 * size * tailAge * tailAge;
    context.beginPath();
    for (const spark of sparks) {
      context.moveTo(x + spark.x * size * tailTravel, y + spark.y * size * tailTravel + tailDrop);
      context.lineTo(x + spark.x * size * travel, y + spark.y * size * travel + drop);
    }
    context.globalAlpha = fade * 0.23;
    context.lineWidth = 4;
    context.strokeStyle = color;
    context.stroke();
    context.globalAlpha = fade;
    context.lineWidth = 1.15;
    context.stroke();
  }

  function drawLaunch(context, sprite, startX, startY, x, y, age) {
    const progress = age / launchSeconds;
    const heightAt = (t) => 1 - (1 - t) ** 1.7;
    const headX = startX + (x - startX) * progress;
    const headY = startY + (y - startY) * heightAt(progress);
    const gradient = context.createLinearGradient(headX, headY + 90, headX, headY);
    gradient.addColorStop(0, "#ffbd5100");
    gradient.addColorStop(0.63, gold);
    gradient.addColorStop(1, "#fff9db");
    context.beginPath();
    for (let step = 6; step >= 0; step -= 1) {
      const t = Math.max(0, progress - step * 0.033);
      context.lineTo(startX + (x - startX) * t, startY + (y - startY) * heightAt(t));
    }
    context.strokeStyle = gradient;
    context.lineWidth = 2.2;
    context.globalAlpha = 0.88;
    context.stroke();
    drawGlow(context, sprite, headX, headY, 14, 0.95);
  }

  function drawBurst(context, sprite, shell, x, y, radius, age) {
    if (age < 0.25) {
      drawGlow(context, sprite, x, y, radius * (0.62 + age), 1 - age / 0.25);
    }
    const fade = Math.max(0, 1 - age / 1.78);
    drawTrails(context, shell.sparks, x, y, radius, age, fade, age < 0.91 ? shell.color : gold);
    drawTrails(context, shell.embers, x, y, radius, age, fade * 0.65, gold);

    const starAge = age - secondaryDelay;
    if (starAge < 0 || starAge > 1.03) return;
    const travel = 1 - Math.exp(-2.5 * secondaryDelay);
    const drop = 0.36 * radius * secondaryDelay ** 2;
    for (const star of shell.stars) {
      const starX = x + star.parent.x * radius * travel;
      const starY = y + star.parent.y * radius * travel + drop;
      if (starAge < 0.31) {
        drawGlow(context, sprite, starX, starY, radius * 0.19, 0.86 * (1 - starAge / 0.31));
      }
      drawTrails(context, star.sparks, starX, starY, radius * 0.24, starAge, 1 - starAge / 1.03, gold);
    }
  }

  return function start(effects) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;

    canvas.className = "celebration-fireworks";
    effects.prepend(canvas);
    const sprite = new Image();
    sprite.src = "./assets/images/celebration/firework-spark.png";
    // Each shell reuses the same finite set of trajectories on every cycle.
    const shells = [false, true].flatMap((right) => bursts.map((burst) => {
      const sparks = makeSparks(56, 0.54, 1.04);
      return {
        ...burst,
        right,
        delay: burst.delay + (right ? 0.2 : 0),
        sparks,
        embers: makeSparks(24, 0.24, 0.8),
        stars: sparks.filter((_, index) => index % 9 === 0)
          .map((parent) => ({ parent, sparks: makeSparks(8, 0.57, 1) })),
      };
    }));

    let width;
    let height;
    let frame;
    let startedAt;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const render = (now) => {
      startedAt ??= now;
      const elapsed = (now - startedAt) / 1000;
      context.clearRect(0, 0, width, height);
      const size = Math.min(width, height);
      const origin = width * 0.04 + Math.min(49, Math.max(18, width * 0.04));
      const startY = height - Math.min(96, Math.max(46, width * 0.075));
      for (const shell of shells) {
        if (elapsed < shell.delay) continue;
        const phase = (elapsed - shell.delay) % cycleSeconds;
        const x = width * (shell.right ? 1 - shell.x : shell.x);
        const y = height * shell.y;
        if (phase < launchSeconds) {
          drawLaunch(context, sprite, shell.right ? width - origin : origin, startY, x, y, phase);
        } else if (phase < launchSeconds + 1.78) {
          drawBurst(context, sprite, shell, x, y, size * shell.size, phase - launchSeconds);
        }
      }
      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.remove();
    };
  };
})();
