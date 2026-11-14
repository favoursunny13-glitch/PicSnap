(() => {
  "use strict";

  if (typeof Phaser === "undefined") {
    console.error("Phaser가 로드되지 않았습니다. 네트워크 연결과 CDN 주소를 확인해 주세요.");
    return;
  }

  const GAME_WIDTH = 1280;
  const GAME_HEIGHT = 720;
  const DEVICE_PIXEL_RATIO = window.devicePixelRatio || 1;
  const SCREEN_RENDER_SCALE = Math.min(
    (window.screen.width * DEVICE_PIXEL_RATIO) / GAME_WIDTH,
    (window.screen.height * DEVICE_PIXEL_RATIO) / GAME_HEIGHT,
  );
  const RENDER_SCALE = Math.min(Math.max(SCREEN_RENDER_SCALE, 1), 3);
  const TEXT_RESOLUTION = Math.min(Math.max(RENDER_SCALE, 2), 3);
  const RANKING_TEXT_RESOLUTION = Math.min(Math.max(TEXT_RESOLUTION * 2, 4), 6);
  const GRID_SIZE = 3;
  const PIECE_COUNT = GRID_SIZE * GRID_SIZE;
  const BOARD_CENTER_X = GAME_WIDTH / 2;
  const BOARD_CENTER_Y = 380;
  const MAX_BOARD_WIDTH = 640;
  const MAX_BOARD_HEIGHT = 470;
  const PIECE_GAP = 8;
  const PIECE_CORNER_RADIUS = 14;
  const STAGE_PREVIEW_WIDTH = 326;
  const STAGE_PREVIEW_HEIGHT = 284;

  const COLORS = {
    background: 0x050408,
    panel: 0x111014,
    panelLight: 0x1c1823,
    primary: 0x9b5cff,
    primaryDark: 0x542790,
    accent: 0xc9a7ff,
    silver: 0xe0d9eb,
    text: "#f8f5fc",
    muted: "#aaa3b4",
    success: 0xbda4ff,
  };

  const STAGES = [
    {
      id: 1,
      title: "Stage 01",
      image: "./assets/images/stage01.jpg?v=20261111-1",
      useBundledImage: true,
      demoAspect: 4255 / 6383,
      palette: ["#ff7b72", "#f6c453", "#5ad7c8", "#5b8def"],
    },
    {
      id: 2,
      title: "Stage 02",
      image: "./assets/images/stage02.jpg?v=20261111-1",
      useBundledImage: true,
      demoAspect: 1.5,
      palette: ["#9b7bff", "#55c2ff", "#67df9a", "#f28cc8"],
    },
    {
      id: 3,
      title: "Stage 03",
      image: "./assets/images/stage03.jpg?v=20261111-1",
      useBundledImage: true,
      demoAspect: 4279 / 6383,
      palette: ["#204961", "#cf83a8", "#71b1bc", "#a3b5c8"],
    },
  ];

  const RANKING_STORAGE_KEY = "picsnap-stage-rankings-v1";
  const MAX_RANKING_ENTRIES = 100;
  const GAME_STATE = {
    clearedStages: new Set(),
    rankingFallback: normalizeRankingData({}),
  };

  function formatPuzzleTime(milliseconds) {
    const safeMilliseconds = Math.max(0, Math.floor(milliseconds));
    const minutes = Math.floor(safeMilliseconds / 60000);
    const seconds = Math.floor((safeMilliseconds % 60000) / 1000);
    const remainder = safeMilliseconds % 1000;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(remainder).padStart(3, "0")}`;
  }

  function normalizeRankingData(value) {
    const normalized = {};
    STAGES.forEach((stage) => {
      const records = Array.isArray(value?.[stage.id]) ? value[stage.id] : [];
      normalized[stage.id] = records
        .filter((record) => record && typeof record.nickname === "string" && Number.isFinite(record.elapsedMs))
        .map((record) => ({
          id: String(record.id || ""),
          nickname: record.nickname.trim().slice(0, 12),
          elapsedMs: Math.max(0, Math.floor(record.elapsedMs)),
          createdAt: Number(record.createdAt) || 0,
        }))
        .filter((record) => record.nickname)
        .sort((a, b) => a.elapsedMs - b.elapsedMs || a.createdAt - b.createdAt)
        .slice(0, MAX_RANKING_ENTRIES);
    });
    return normalized;
  }

  function loadRankings() {
    try {
      const stored = window.localStorage.getItem(RANKING_STORAGE_KEY);
      if (stored) {
        GAME_STATE.rankingFallback = normalizeRankingData(JSON.parse(stored));
      }
    } catch (error) {
      console.warn("로컬 랭킹을 불러오지 못해 현재 세션 기록을 사용합니다.", error);
    }
    return GAME_STATE.rankingFallback;
  }

  function saveRanking(stageId, nickname, elapsedMs) {
    const rankings = loadRankings();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nickname: nickname.trim().replace(/\s+/g, " ").slice(0, 12),
      elapsedMs: Math.max(0, Math.floor(elapsedMs)),
      createdAt: Date.now(),
    };
    rankings[stageId] = [...(rankings[stageId] || []), entry]
      .sort((a, b) => a.elapsedMs - b.elapsedMs || a.createdAt - b.createdAt)
      .slice(0, MAX_RANKING_ENTRIES);
    GAME_STATE.rankingFallback = rankings;
    try {
      window.localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(rankings));
    } catch (error) {
      console.warn("로컬 랭킹을 저장하지 못해 현재 세션에만 기록합니다.", error);
    }
    return entry;
  }

  function clearRankings() {
    GAME_STATE.rankingFallback = normalizeRankingData({});
    try {
      window.localStorage.removeItem(RANKING_STORAGE_KEY);
    } catch (error) {
      console.warn("로컬 랭킹 저장소를 초기화하지 못했습니다.", error);
    }
  }

  function stageTextureKey(stageId) {
    return `stage-${stageId}`;
  }

  function applyHighQualityFilter(scene, textureKey) {
    const texture = scene.textures.get(textureKey);
    if (texture && typeof texture.setFilter === "function") {
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  function configureHighResolutionCamera(scene) {
    scene.cameras.main.setOrigin(0, 0);
    scene.cameras.main.setZoom(RENDER_SCALE);
    scene.cameras.main.setScroll(0, 0);
  }

  function addText(scene, x, y, text, style) {
    // Canvas 렌더러가 표시 크기를 계산할 때 생성 시 지정한 텍스처 해상도를 사용한다.
    return scene.add.text(x, y, text, { resolution: TEXT_RESOLUTION, ...style });
  }

  function loadConfiguredStageImages(scene) {
    STAGES.filter((stage) => stage.useBundledImage).forEach((stage) => {
      const key = stageTextureKey(stage.id);
      if (!scene.textures.exists(key)) {
        scene.load.image(key, stage.image);
      }
    });
  }

  function ensureStageTexture(scene, stage) {
    const key = stageTextureKey(stage.id);
    if (scene.textures.exists(key)) {
      applyHighQualityFilter(scene, key);
      return key;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(768 * (stage.demoAspect || 1));
    canvas.height = 768;
    const width = canvas.width;
    const height = canvas.height;
    const minimumSize = Math.min(width, height);
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, stage.palette[0]);
    gradient.addColorStop(0.38, stage.palette[1]);
    gradient.addColorStop(0.7, stage.palette[2]);
    gradient.addColorStop(1, stage.palette[3]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.globalAlpha = 0.2;
    for (let i = 0; i < 12; i += 1) {
      context.beginPath();
      context.arc(
        width * ((i % 4) + 0.5) / 4,
        height * (Math.floor(i / 4) + 0.5) / 3,
        minimumSize * (0.07 + i * 0.004),
        0,
        Math.PI * 2,
      );
      context.fillStyle = i % 2 ? "#ffffff" : "#08111f";
      context.fill();
    }
    context.globalAlpha = 1;

    const labelWidth = width * 0.68;
    const labelHeight = height * 0.255;
    const labelX = (width - labelWidth) / 2;
    const labelY = (height - labelHeight) / 2;
    context.fillStyle = "rgba(8, 17, 31, 0.70)";
    context.roundRect(labelX, labelY, labelWidth, labelHeight, minimumSize * 0.04);
    context.fill();
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.font = `700 ${Math.round(minimumSize * 0.10)}px sans-serif`;
    context.fillText("PicSnap", width / 2, height * 0.49);
    context.font = `500 ${Math.round(minimumSize * 0.043)}px sans-serif`;
    context.fillText(stage.title, width / 2, height * 0.57);
    context.strokeStyle = "rgba(255,255,255,0.55)";
    context.lineWidth = Math.max(4, minimumSize * 0.01);
    const borderMargin = minimumSize * 0.024;
    context.strokeRect(borderMargin, borderMargin, width - borderMargin * 2, height - borderMargin * 2);

    scene.textures.addCanvas(key, canvas);
    applyHighQualityFilter(scene, key);
    return key;
  }

  function ensureBlurredStageTexture(scene, sourceKey) {
    const blurredKey = `${sourceKey}-blurred-preview`;
    if (scene.textures.exists(blurredKey)) {
      return blurredKey;
    }

    const source = scene.textures.get(sourceKey).getSourceImage();
    const sourceWidth = source.naturalWidth || source.width;
    const sourceHeight = source.naturalHeight || source.height;
    const previewScale = Math.min(
      1,
      STAGE_PREVIEW_WIDTH * RENDER_SCALE / sourceWidth,
      STAGE_PREVIEW_HEIGHT * RENDER_SCALE / sourceHeight,
    );
    const texture = scene.textures.createCanvas(
      blurredKey,
      Math.round(sourceWidth * previewScale),
      Math.round(sourceHeight * previewScale),
    );
    const canvas = texture.getCanvas();
    const context = texture.getContext();
    const blurAmount = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) * 0.008));

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = `blur(${blurAmount}px)`;
    context.drawImage(
      source,
      -blurAmount,
      -blurAmount,
      canvas.width + blurAmount * 2,
      canvas.height + blurAmount * 2,
    );
    context.filter = "none";
    texture.refresh();
    applyHighQualityFilter(scene, blurredKey);
    return blurredKey;
  }

  function getStage(stageId) {
    return STAGES.find((stage) => stage.id === stageId) || STAGES[0];
  }

  function addPremiumBackground(scene, accentColor = COLORS.primary) {
    scene.cameras.main.setBackgroundColor(COLORS.background);
    scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.background, 1).setDepth(-100);

    const leftGlow = scene.add.circle(-210, 190, 390, accentColor, 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-90);
    const rightGlow = scene.add.circle(1490, 530, 440, 0x777780, 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-90);
    scene.tweens.add({
      targets: leftGlow,
      x: -40,
      alpha: 0.115,
      duration: 1050,
      ease: "Cubic.Out",
      onComplete: () => scene.tweens.add({
        targets: leftGlow,
        x: 65,
        y: 235,
        scale: 1.16,
        alpha: 0.065,
        duration: 6200,
        ease: "Sine.InOut",
        yoyo: true,
        repeat: -1,
      }),
    });
    scene.tweens.add({
      targets: rightGlow,
      x: 1320,
      alpha: 0.095,
      duration: 1150,
      delay: 90,
      ease: "Cubic.Out",
      onComplete: () => scene.tweens.add({
        targets: rightGlow,
        x: 1195,
        y: 475,
        scale: 0.88,
        duration: 7600,
        ease: "Sine.InOut",
        yoyo: true,
        repeat: -1,
      }),
    });

    for (let index = 0; index < 18; index += 1) {
      const dot = scene.add.circle(
        40 + ((index * 173) % 1200),
        100 + ((index * 97) % 570),
        index % 3 === 0 ? 1.5 : 1,
        index % 4 === 0 ? accentColor : 0xffffff,
        index % 4 === 0 ? 0.28 : 0.11,
      ).setDepth(-80);
      const targetAlpha = dot.alpha;
      dot.setAlpha(0).setScale(0.2);
      scene.tweens.add({
        targets: dot,
        alpha: targetAlpha,
        scale: 1,
        duration: 420,
        delay: 330 + index * 38,
        ease: "Back.Out",
        onComplete: () => scene.tweens.add({
          targets: dot,
          y: dot.y - 18 - (index % 4) * 5,
          alpha: targetAlpha * 0.35,
          duration: 2400 + index * 170,
          ease: "Sine.InOut",
          yoyo: true,
          repeat: -1,
        }),
      });
    }
  }

  function drawRoundedPanel(graphics, x, y, width, height, options = {}) {
    const radius = options.radius || 28;
    graphics.clear();
    graphics.fillStyle(options.shadowColor || 0x000000, options.shadowAlpha ?? 0.34);
    graphics.fillRoundedRect(x - width / 2 + 5, y - height / 2 + 10, width, height, radius);
    graphics.fillStyle(options.fillColor || COLORS.panel, options.fillAlpha ?? 0.9);
    graphics.fillRoundedRect(x - width / 2, y - height / 2, width, height, radius);
    graphics.lineStyle(options.lineWidth || 1.5, options.strokeColor || 0xffffff, options.strokeAlpha ?? 0.17);
    graphics.strokeRoundedRect(x - width / 2, y - height / 2, width, height, radius);
    graphics.lineStyle(1, 0xffffff, options.highlightAlpha ?? 0.16);
    graphics.lineBetween(x - width / 2 + radius, y - height / 2 + 1, x + width / 2 - radius, y - height / 2 + 1);
    return graphics;
  }

  function addButton(scene, x, y, width, height, label, onClick, options = {}) {
    const fillColor = options.fillColor || COLORS.primary;
    const textColor = options.textColor || "#090909";
    const container = scene.add.container(x, y);
    const background = scene.add.graphics();
    const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    const text = addText(scene, 0, 0, label, {
      fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
      fontSize: options.fontSize || "24px",
      fontStyle: "600",
      color: textColor,
      letterSpacing: 0.3,
      resolution: options.resolution ?? TEXT_RESOLUTION,
    }).setOrigin(0.5);
    const redraw = (hovered = false) => drawRoundedPanel(background, 0, 0, width, height, {
      radius: height / 2,
      fillColor: hovered ? (options.hoverColor || COLORS.accent) : fillColor,
      fillAlpha: options.fillAlpha ?? 0.98,
      strokeColor: options.strokeColor || 0xffffff,
      strokeAlpha: hovered ? 0.62 : 0.28,
      shadowAlpha: hovered ? 0.46 : 0.25,
      highlightAlpha: 0.32,
    });
    redraw(false);
    container.add([background, hitArea, text]);

    hitArea.on("pointerover", () => {
      scene.tweens.add({ targets: container, scale: 1.04, duration: 160, ease: "Cubic.Out" });
      redraw(true);
    });
    hitArea.on("pointerout", () => {
      scene.tweens.add({ targets: container, scale: 1, duration: 180, ease: "Cubic.Out" });
      redraw(false);
    });
    hitArea.on("pointerdown", () => container.setScale(0.97));
    hitArea.on("pointerup", () => {
      container.setScale(1.04);
      onClick();
    });
    return container;
  }

  function showNicknamePrompt(scene, elapsedMs, onSubmit) {
    const overlay = document.createElement("div");
    overlay.className = "nickname-modal";
    const wasSceneInputEnabled = scene.input.enabled;
    scene.input.enabled = false;

    const stopGameInput = (event) => event.stopPropagation();
    ["pointerdown", "pointerup", "click", "dblclick", "contextmenu", "wheel"].forEach((eventName) => {
      overlay.addEventListener(eventName, stopGameInput);
    });

    const panel = document.createElement("section");
    panel.className = "nickname-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "nickname-title");

    const eyebrow = document.createElement("p");
    eyebrow.className = "nickname-eyebrow";
    eyebrow.textContent = `FINAL TIME  /  ${formatPuzzleTime(elapsedMs)}`;

    const title = document.createElement("h2");
    title.id = "nickname-title";
    title.textContent = "기록에 남길 이름";

    const description = document.createElement("p");
    description.className = "nickname-description";
    description.textContent = "이 브라우저의 스테이지 랭킹에 표시됩니다.";

    const input = document.createElement("input");
    input.className = "nickname-input";
    input.type = "text";
    input.maxLength = 12;
    input.autocomplete = "nickname";
    input.placeholder = "닉네임을 입력하세요";
    input.setAttribute("aria-label", "랭킹 닉네임");

    const error = document.createElement("p");
    error.className = "nickname-error";
    error.textContent = "1자 이상의 닉네임을 입력해 주세요.";

    const actions = document.createElement("div");
    actions.className = "nickname-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "nickname-button nickname-button-secondary";
    cancelButton.textContent = "나중에 하기";
    const submitButton = document.createElement("button");
    submitButton.type = "button";
    submitButton.className = "nickname-button nickname-button-primary";
    submitButton.textContent = "기록 등록";
    actions.append(cancelButton, submitButton);
    panel.append(eyebrow, title, description, input, error, actions);
    overlay.append(panel);
    document.body.append(overlay);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      overlay.remove();
      window.requestAnimationFrame(() => {
        if (scene.sys?.isActive()) {
          scene.input.enabled = wasSceneInputEnabled;
        }
      });
    };
    const submit = () => {
      const nickname = input.value.trim().replace(/\s+/g, " ").slice(0, 12);
      if (!nickname) {
        panel.classList.add("is-invalid");
        input.focus();
        return;
      }
      cleanup();
      onSubmit(nickname);
    };
    input.addEventListener("input", () => panel.classList.remove("is-invalid"));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
      if (event.key === "Escape") cleanup();
    });
    cancelButton.addEventListener("click", cleanup);
    submitButton.addEventListener("click", submit);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    window.requestAnimationFrame(() => input.focus());
  }

  function showRankingPanel(scene, initialStageId = 1, options = {}) {
    const addRankingText = (x, y, text, style) => addText(scene, x, y, text, {
      ...style,
      resolution: RANKING_TEXT_RESOLUTION,
    });
    const createdObjects = [];
    const addObject = (object) => {
      createdObjects.push(object);
      return object;
    };
    const dimmer = addObject(scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020104, 0.82)
      .setDepth(9000)
      .setInteractive());
    const panel = addObject(scene.add.graphics().setDepth(9001));
    drawRoundedPanel(panel, GAME_WIDTH / 2, 360, 790, 570, {
      radius: 34,
      fillColor: 0x0d0a12,
      fillAlpha: 0.98,
      strokeColor: COLORS.primary,
      strokeAlpha: 0.72,
      lineWidth: 2,
      shadowAlpha: 0.72,
      highlightAlpha: 0.28,
    });
    addObject(addRankingText(300, 103, options.title || "STAGE RANKING", {
      fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
      fontSize: "13px",
      fontStyle: "700",
      color: "#b98cff",
      letterSpacing: 2.8,
    }).setDepth(9002));
    addObject(addRankingText(300, 139, "Fastest reveals.", {
      fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
      fontSize: "32px",
      fontStyle: "700",
      color: COLORS.text,
      letterSpacing: -1,
    }).setDepth(9002));
    addObject(addRankingText(980, 139, "LOCAL ARCHIVE", {
      fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
      fontSize: "10px",
      fontStyle: "600",
      color: COLORS.muted,
      letterSpacing: 1.5,
    }).setOrigin(1, 0.5).setDepth(9002));

    let selectedStageId = initialStageId;
    let rowObjects = [];
    let tabButtons = [];
    let isPanelActive = true;
    let developerResetHandler = null;
    const clearRows = () => {
      rowObjects.forEach((object) => object.destroy());
      rowObjects = [];
    };
    const drawRows = () => {
      clearRows();

      const rankings = loadRankings()[selectedStageId] || [];
      const headers = [
        addRankingText(332, 235, "RANK", { fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#777080", letterSpacing: 1.5 }),
        addRankingText(430, 235, "NICKNAME", { fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#777080", letterSpacing: 1.5 }),
        addRankingText(948, 235, "TIME", { fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#777080", letterSpacing: 1.5 }).setOrigin(1, 0),
      ];
      headers.forEach((header) => header.setDepth(9003));
      rowObjects.push(...headers);

      if (!rankings.length) {
        rowObjects.push(addRankingText(GAME_WIDTH / 2, 405, "아직 등록된 기록이 없습니다.\n첫 번째 기록의 주인공이 되어보세요.", {
          fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
          fontSize: "18px",
          fontStyle: "500",
          color: "#c5bdce",
          align: "center",
          lineSpacing: 9,
        }).setOrigin(0.5).setDepth(9003));
        return;
      }

      const rankedRecords = rankings.map((record, index) => ({ record, rank: index + 1 }));
      const highlightedIndex = rankedRecords.findIndex(({ record }) => record.id === options.highlightId);
      const visibleRecords = highlightedIndex >= 8
        ? [...rankedRecords.slice(0, 7), rankedRecords[highlightedIndex]]
        : rankedRecords.slice(0, 8);
      visibleRecords.forEach(({ record, rank: actualRank }, index) => {
        const y = 283 + index * 43;
        const isHighlighted = record.id === options.highlightId;
        const rowBackground = scene.add.rectangle(GAME_WIDTH / 2, y, 650, 36, isHighlighted ? COLORS.primary : 0xffffff, isHighlighted ? 0.16 : 0.025)
          .setStrokeStyle(1, isHighlighted ? COLORS.accent : 0xffffff, isHighlighted ? 0.48 : 0.04)
          .setDepth(9002);
        const rank = addRankingText(348, y, String(actualRank).padStart(2, "0"), {
          fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: "13px", fontStyle: "700", color: index < 3 ? "#c9a7ff" : "#8d8795",
        }).setOrigin(0.5).setDepth(9003);
        const nickname = addRankingText(430, y, record.nickname, {
          fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif', fontSize: "15px", fontStyle: isHighlighted ? "700" : "500", color: COLORS.text,
        }).setOrigin(0, 0.5).setDepth(9003);
        const time = addRankingText(948, y, formatPuzzleTime(record.elapsedMs), {
          fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: "14px", fontStyle: "700", color: isHighlighted ? "#d9c4ff" : "#c6bfcb", letterSpacing: 0.8,
        }).setOrigin(1, 0.5).setDepth(9003);
        rowObjects.push(rowBackground, rank, nickname, time);
      });
    };
    const drawTabs = () => {
      tabButtons.forEach((button) => button.destroy());
      const tabWidth = 185;
      const tabGap = 20;
      const tabGroupWidth = STAGES.length * tabWidth + (STAGES.length - 1) * tabGap;
      const firstTabX = GAME_WIDTH / 2 - tabGroupWidth / 2 + tabWidth / 2;
      tabButtons = STAGES.map((stage, index) => {
        const selected = stage.id === selectedStageId;
        return addButton(scene, firstTabX + index * (tabWidth + tabGap), 194, tabWidth, 38, `LOOK ${String(stage.id).padStart(2, "0")}`, () => {
          selectedStageId = stage.id;
          drawTabs();
          drawRows();
        }, {
          fillColor: selected ? COLORS.primary : COLORS.panelLight,
          hoverColor: selected ? COLORS.accent : COLORS.primaryDark,
          textColor: selected ? "#09070c" : COLORS.text,
          strokeColor: selected ? COLORS.accent : 0xffffff,
          fontSize: "11px",
          resolution: RANKING_TEXT_RESOLUTION,
        }).setDepth(9004);
      });
      createdObjects.push(...tabButtons);
    };
    const closePanel = () => {
      if (!isPanelActive) return;
      isPanelActive = false;
      if (developerResetHandler) {
        window.removeEventListener("keydown", developerResetHandler);
      }
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, closePanel);
      clearRows();
      [...new Set(createdObjects)].forEach((object) => object?.active && object.destroy());
    };
    if (scene.scene.key === "MenuScene") {
      developerResetHandler = (event) => {
        const hasModifier = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
        if (!isPanelActive || event.repeat || hasModifier || event.code !== "Backquote") return;
        event.preventDefault();
        clearRankings();
        drawRows();
      };
      window.addEventListener("keydown", developerResetHandler);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, closePanel);
    addObject(addButton(scene, 966, 104, 72, 34, "CLOSE", closePanel, {
      fillColor: COLORS.panelLight,
      hoverColor: COLORS.primaryDark,
      textColor: COLORS.text,
      strokeColor: 0xffffff,
      fontSize: "10px",
      resolution: RANKING_TEXT_RESOLUTION,
    }).setDepth(9005));
    addObject(addRankingText(GAME_WIDTH / 2, 620, "기록은 현재 브라우저에 스테이지별로 저장됩니다.", {
      fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
      fontSize: "11px",
      color: "#716a79",
      letterSpacing: 0.2,
    }).setOrigin(0.5).setDepth(9002));
    drawTabs();
    drawRows();
    return { close: closePanel };
  }

  function enableGraduationEasterEgg(scene) {
    const input = document.getElementById("celebration-code");
    const dialog = document.getElementById("celebration");
    const effects = dialog.querySelector(".celebration-effects");
    const gameContainer = document.getElementById("game-container");
    const phrase = "졸업전시 축하해";
    let wasSceneInputEnabled = null;
    let stopFireworks = null;

    const focusInput = () => {
      if (!dialog.open) input.focus({ preventScroll: true });
    };
    const clearInput = () => {
      input.value = "";
    };
    const restoreGameInput = () => {
      if (wasSceneInputEnabled === null) return;
      scene.input.enabled = wasSceneInputEnabled;
      wasSceneInputEnabled = null;
    };
    const clearEffects = () => {
      stopFireworks?.();
      stopFireworks = null;
      effects.replaceChildren();
    };
    const submitCode = (event) => {
      if (event.key !== "Enter" && event.code !== "Enter" && event.code !== "NumpadEnter") return;
      if (event.isComposing || dialog.open) return;

      const matchesPhrase = input.value.normalize("NFC").trim() === phrase;
      clearInput();
      if (!matchesPhrase) return;
      dialog.showModal();
      wasSceneInputEnabled ??= scene.input.enabled;
      scene.input.enabled = false;
      clearEffects();
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        playGraduationEffects(effects);
        stopFireworks = startCelebrationFireworks(effects);
      }
    };
    const onClose = () => {
      if (dialog.open) return;
      restoreGameInput();
      clearEffects();
      focusInput();
    };
    const restoreAfterClick = (event) => {
      if (event.pointerType === "mouse") focusInput();
    };

    input.hidden = false;
    // Enter 키를 놓을 때 확인하면 한글 입력기가 확정한 마지막 음절까지 읽을 수 있다.
    input.addEventListener("keyup", submitCode);
    input.addEventListener("blur", clearInput);
    gameContainer.addEventListener("pointerup", restoreAfterClick);
    dialog.addEventListener("close", onClose);
    focusInput();

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      input.removeEventListener("keyup", submitCode);
      input.removeEventListener("blur", clearInput);
      gameContainer.removeEventListener("pointerup", restoreAfterClick);
      dialog.removeEventListener("close", onClose);
      dialog.close();
      restoreGameInput();
      clearEffects();
      clearInput();
      input.hidden = true;
    });
  }

  function playGraduationEffects(effects) {
    const colors = ["#ffce72", "#f88ab6", "#a98cff", "#83e4dd", "#fff3dd"];
    const random = (min, max) => min + Math.random() * (max - min);
    const addParticle = (type, x, delay) => {
      const particle = document.createElement("i");
      particle.className = `celebration-${type}`;
      particle.style.left = x;
      particle.style.color = colors[Math.floor(Math.random() * colors.length)];
      particle.style.animationDelay = `${delay}s`;
      particle.style.animationDuration = `${random(2.4, 4.6)}s`;
      particle.style.setProperty("--spin", `${random(240, 920)}deg`);
      effects.append(particle);
      return particle;
    };

    for (let i = 0; i < 105; i += 1) {
      const confetti = addParticle("fall", `${random(0, 100)}%`, random(-1, 4));
      confetti.style.setProperty("--drift", `${random(-12, 12)}vw`);
    }

    for (let i = 0; i < 48; i += 1) {
      const glitter = addParticle("glitter", `${random(0, 100)}%`, random(-1.4, 2.8));
      glitter.style.setProperty("--glitter-drop", `${random(16, 65)}vh`);
    }

    for (const direction of [1, 0, -1]) {
      const origin = `${50 - direction * 46}%`;
      const isCenter = direction === 0;
      const popper = document.createElement("div");
      popper.className = "celebration-popper";
      popper.style.left = origin;
      popper.style.setProperty("--popper-angle", `${direction * 34}deg`);
      effects.append(popper);

      const sparkCount = isCenter ? 18 : 28;
      for (let i = 0; i < sparkCount; i += 1) {
        const spark = addParticle("burst", origin, random(0, 0.55));
        const travel = isCenter ? random(-12, 12) : direction * random(3, 32);
        const rise = isCenter ? random(12, 30) : random(23, 73);
        spark.style.setProperty("--travel", `${travel}vw`);
        spark.style.setProperty("--rise", `${rise}vh`);
        if (isCenter) spark.style.bottom = "clamp(45px, 8vw, 106px)";
      }
    }

    const photoPositions = [13, 85, 30, 70, 9, 93, 38, 62, 20, 79, 50];
    photoPositions.forEach((position, index) => {
      const photo = document.createElement("img");
      const number = String(index).padStart(2, "0");
      photo.alt = "";
      photo.style.left = `${position}%`;
      photo.style.animationDelay = `${0.24 + index * 0.46}s`;
      photo.style.animationDuration = `${random(5.6, 6.7)}s`;
      photo.style.setProperty("--drift", `${position < 50 ? 4 : -4}vw`);
      photo.style.setProperty("--turn", `${index % 2 === 0 ? 1 : -1}turn`);
      photo.style.setProperty("--tilt", `${random(-18, 18)}deg`);
      photo.className = "celebration-photo";
      photo.addEventListener("load", () => photo.classList.add("is-falling"), { once: true });
      photo.src = `./assets/images/celebration/photo-${number}.jpg`;
      effects.append(photo);
    });
  }

  class MenuScene extends Phaser.Scene {
    constructor() {
      super("MenuScene");
    }

    preload() {
      loadConfiguredStageImages(this);
    }

    create() {
      configureHighResolutionCamera(this);
      addPremiumBackground(this);
      enableGraduationEasterEgg(this);

      const eyebrow = addText(this, GAME_WIDTH / 2, 48, "PICSNAP  /  FASHION PUZZLE", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "13px",
        fontStyle: "600",
        color: "#b98cff",
        letterSpacing: 3.2,
      }).setOrigin(0.5).setAlpha(0);
      const title = addText(this, GAME_WIDTH / 2, 92, "Reveal the look.", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
        fontSize: "54px",
        fontStyle: "700",
        color: COLORS.text,
        letterSpacing: -2.2,
      }).setOrigin(0.5).setAlpha(0).setTint(0xffffff, 0xf0e8ff, 0xffffff, 0xc9a7ff);
      const subtitle = addText(this, GAME_WIDTH / 2, 137, "조각을 연결하고, 감춰진 패션 룩을 완성하세요.", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
        fontSize: "18px",
        color: COLORS.muted,
        letterSpacing: -0.2,
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: eyebrow, alpha: 1, y: 42, duration: 650, ease: "Cubic.Out" });
      this.tweens.add({ targets: title, alpha: 1, y: 84, duration: 760, delay: 90, ease: "Cubic.Out" });
      this.tweens.add({ targets: subtitle, alpha: 1, duration: 700, delay: 180, ease: "Cubic.Out" });

      addButton(this, 976, 44, 166, 42, "방명록 남기기", () => {
        window.location.assign("./guestbook.html");
      }, {
        fillColor: COLORS.primaryDark,
        hoverColor: COLORS.primary,
        textColor: COLORS.text,
        strokeColor: COLORS.accent,
        fontSize: "13px",
      }).setDepth(100);

      addButton(this, 1160, 44, 166, 42, "VIEW RANKING", () => showRankingPanel(this, 1), {
        fillColor: COLORS.panelLight,
        hoverColor: COLORS.primaryDark,
        textColor: COLORS.text,
        strokeColor: COLORS.primary,
        fontSize: "11px",
      }).setDepth(100);

      const cardWidth = 390;
      const cardHeight = 430;
      const gap = 34;
      const totalWidth = STAGES.length * cardWidth + (STAGES.length - 1) * gap;
      const startX = (GAME_WIDTH - totalWidth) / 2 + cardWidth / 2;

      STAGES.forEach((stage, index) => {
        const x = startX + index * (cardWidth + gap);
        const y = 400;
        const isCleared = GAME_STATE.clearedStages.has(stage.id);
        const cardContainer = this.add.container(x, y + 34).setAlpha(0);
        const cardVisual = this.add.graphics();
        const cardHit = this.add.rectangle(0, 0, cardWidth, cardHeight, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true });
        const drawCard = (hovered = false) => drawRoundedPanel(cardVisual, 0, 0, cardWidth, cardHeight, {
          radius: 30,
          fillColor: hovered ? 0x1c1714 : COLORS.panel,
          fillAlpha: hovered ? 0.96 : 0.88,
          strokeColor: isCleared ? COLORS.success : COLORS.primary,
          strokeAlpha: hovered ? 0.82 : (isCleared ? 0.55 : 0.3),
          lineWidth: hovered ? 2.2 : 1.3,
          shadowAlpha: hovered ? 0.6 : 0.4,
          highlightAlpha: hovered ? 0.34 : 0.14,
        });
        drawCard(false);
        const textureKey = ensureStageTexture(this, stage);
        const source = this.textures.get(textureKey).getSourceImage();
        const sourceWidth = source.naturalWidth || source.width;
        const sourceHeight = source.naturalHeight || source.height;
        const thumbnailScale = Math.min(STAGE_PREVIEW_WIDTH / sourceWidth, STAGE_PREVIEW_HEIGHT / sourceHeight);
        const previewTextureKey = isCleared
          ? textureKey
          : ensureBlurredStageTexture(this, textureKey);
        const imageGlow = this.add.graphics();
        drawRoundedPanel(imageGlow, 0, -28, 342, 300, {
          radius: 23,
          fillColor: 0x060606,
          fillAlpha: 0.96,
          strokeColor: isCleared ? COLORS.success : 0xffffff,
          strokeAlpha: isCleared ? 0.5 : 0.14,
          shadowAlpha: 0.34,
          highlightAlpha: 0.1,
        });
        const image = this.add.image(0, -28, previewTextureKey)
          .setDisplaySize(sourceWidth * thumbnailScale, sourceHeight * thumbnailScale);
        const lookLabel = addText(this, -164, -194, `LOOK  ${String(stage.id).padStart(2, "0")}`, {
          fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
          fontSize: "12px",
          fontStyle: "600",
          color: isCleared ? "#d6c7ff" : "#b98cff",
          letterSpacing: 2.4,
        }).setOrigin(0, 0.5);
        const stageTitle = addText(this, -164, 155, stage.title.replace("Stage", "Editorial"), {
          fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
          fontSize: "24px",
          fontStyle: "600",
          color: COLORS.text,
          letterSpacing: -0.4,
        }).setOrigin(0, 0.5);
        const status = addText(this, 164, 156, isCleared ? "REVEALED  ✓" : "DISCOVER  →", {
          fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
          fontSize: "12px",
          fontStyle: "600",
          color: isCleared ? "#d6c7ff" : "#e0d9eb",
          letterSpacing: 1.2,
        }).setOrigin(1, 0.5);
        const shimmer = this.add.rectangle(-135, -206, 70, 2, 0xffffff, 0.6).setAlpha(0.15);
        cardContainer.add([cardVisual, imageGlow, image, lookLabel, stageTitle, status, shimmer, cardHit]);

        const openStage = () => this.scene.start("PuzzleScene", { stageId: stage.id });
        cardHit.on("pointerover", () => {
          this.tweens.killTweensOf(image);
          drawCard(true);
          this.tweens.add({ targets: cardContainer, y: y - 8, scale: 1.018, duration: 220, ease: "Cubic.Out" });
          this.tweens.add({ targets: image, scaleX: image.scaleX * 1.018, scaleY: image.scaleY * 1.018, duration: 260, ease: "Cubic.Out" });
        });
        cardHit.on("pointerout", () => {
          this.tweens.killTweensOf(image);
          drawCard(false);
          this.tweens.add({ targets: cardContainer, y, scale: 1, duration: 240, ease: "Cubic.Out" });
          image.setDisplaySize(sourceWidth * thumbnailScale, sourceHeight * thumbnailScale);
        });
        cardHit.on("pointerdown", () => cardContainer.setScale(0.985));
        cardHit.on("pointerup", openStage);
        this.tweens.add({ targets: cardContainer, alpha: 1, y, duration: 620, delay: 220 + index * 130, ease: "Back.Out" });
        this.tweens.add({ targets: shimmer, x: 135, alpha: 0.42, duration: 1700, delay: 800 + index * 280, ease: "Sine.InOut", yoyo: true, repeat: -1, repeatDelay: 1800 });
      });

      addText(this, GAME_WIDTH / 2, 665, "SELECT A LOOK  ·  DRAG TO REVEAL", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "11px",
        color: "#6e6e73",
        letterSpacing: 2.2,
      }).setOrigin(0.5);

    }
  }

  class PuzzleScene extends Phaser.Scene {
    constructor() {
      super("PuzzleScene");
      this.pieces = [];
      this.slotOccupants = [];
      this.dragState = null;
      this.isSwapping = false;
      this.isClearing = false;
      this.timerStartedAt = 0;
      this.elapsedMs = 0;
      this.timerText = null;
      this.timerEvent = null;
    }

    init(data) {
      this.stage = getStage(data.stageId);
      this.pieces = [];
      this.slotOccupants = new Array(PIECE_COUNT).fill(null);
      this.dragState = null;
      this.isSwapping = false;
      this.isClearing = false;
      this.timerStartedAt = performance.now();
      this.elapsedMs = 0;
      this.timerText = null;
      this.timerEvent = null;
    }

    preload() {
      if (this.stage.useBundledImage && !this.textures.exists(stageTextureKey(this.stage.id))) {
        this.load.image(stageTextureKey(this.stage.id), this.stage.image);
      }
    }

    create() {
      configureHighResolutionCamera(this);
      addPremiumBackground(this, this.stage.id === 1 ? COLORS.primary : 0xb399ff);
      const navPanel = this.add.graphics().setDepth(2000);
      drawRoundedPanel(navPanel, GAME_WIDTH / 2, 42, 1220, 64, {
        radius: 22,
        fillColor: 0x111113,
        fillAlpha: 0.82,
        strokeColor: 0xffffff,
        strokeAlpha: 0.14,
        shadowAlpha: 0.3,
        highlightAlpha: 0.22,
      });
      addText(this, 48, 31, `LOOK  ${String(this.stage.id).padStart(2, "0")}`, {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "11px",
        fontStyle: "600",
        color: "#b98cff",
        letterSpacing: 2.3,
      }).setOrigin(0, 0.5).setDepth(2001);
      addText(this, 48, 51, this.stage.title.replace("Stage", "Editorial"), {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "21px",
        fontStyle: "600",
        color: COLORS.text,
      }).setOrigin(0, 0.5).setDepth(2001);
      addText(this, GAME_WIDTH / 2, 40, "맞는 조각은 연결되며, 연결된 조각은 함께 움직입니다", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
        fontSize: "15px",
        color: COLORS.muted,
      }).setOrigin(0.5).setDepth(2001);
      addButton(this, 1170, 40, 160, 44, "COLLECTION", () => this.scene.start("MenuScene"), {
        fillColor: COLORS.panelLight,
        strokeColor: 0xffffff,
        textColor: COLORS.text,
        hoverColor: COLORS.primaryDark,
        fontSize: "12px",
      }).setDepth(2002);

      const timerPanel = this.add.graphics().setDepth(2000);
      drawRoundedPanel(timerPanel, GAME_WIDTH / 2, 111, 232, 54, {
        radius: 20,
        fillColor: 0x0d0a12,
        fillAlpha: 0.94,
        strokeColor: COLORS.primary,
        strokeAlpha: 0.62,
        lineWidth: 1.5,
        shadowAlpha: 0.42,
        highlightAlpha: 0.24,
      });
      addText(this, GAME_WIDTH / 2, 98, "PUZZLE TIME", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "9px",
        fontStyle: "700",
        color: "#9f7ad9",
        letterSpacing: 2.1,
      }).setOrigin(0.5).setDepth(2001);
      this.timerText = addText(this, GAME_WIDTH / 2, 119, formatPuzzleTime(0), {
        fontFamily: '"SFMono-Regular", Consolas, monospace',
        fontSize: "20px",
        fontStyle: "700",
        color: "#f6f0ff",
        letterSpacing: 1.4,
      }).setOrigin(0.5).setDepth(2001);
      const updateTimer = () => {
        if (this.isClearing) return;
        this.elapsedMs = Math.max(0, performance.now() - this.timerStartedAt);
        this.timerText.setText(formatPuzzleTime(this.elapsedMs));
      };
      updateTimer();
      this.timerEvent = this.time.addEvent({ delay: 16, loop: true, callback: updateTimer });

      const textureKey = ensureStageTexture(this, this.stage);
      this.boardLayout = this.calculateBoardLayout(textureKey);
      this.createPieceTextures(textureKey);
      this.createBoardGrid();
      this.createPieces();
      this.updatePieceVisuals();
      this.bindDragEvents();

      this.pieces.forEach((piece, index) => {
        const targetY = piece.y;
        piece.y += 14;
        piece.setAlpha(0);
        this.tweens.add({
          targets: piece,
          y: targetY,
          alpha: 1,
          duration: 440,
          delay: 100 + index * 38,
          ease: "Cubic.Out",
        });
      });

    }

    calculateBoardLayout(sourceKey) {
      const source = this.textures.get(sourceKey).getSourceImage();
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const aspectRatio = sourceWidth / sourceHeight;
      let boardWidth = MAX_BOARD_WIDTH;
      let boardHeight = boardWidth / aspectRatio;

      if (boardHeight > MAX_BOARD_HEIGHT) {
        boardHeight = MAX_BOARD_HEIGHT;
        boardWidth = boardHeight * aspectRatio;
      }

      return {
        boardWidth,
        boardHeight,
        pieceWidth: boardWidth / GRID_SIZE,
        pieceHeight: boardHeight / GRID_SIZE,
      };
    }

    createBoardGrid() {
      const board = this.add.graphics().setDepth(-10);
      const { boardWidth, boardHeight, pieceWidth, pieceHeight } = this.boardLayout;
      const boardLeft = BOARD_CENTER_X - boardWidth / 2;
      const boardTop = BOARD_CENTER_Y - boardHeight / 2;

      const aura = this.add.rectangle(BOARD_CENTER_X, BOARD_CENTER_Y + 10, boardWidth + 70, boardHeight + 70, COLORS.primary, 0.035)
        .setDepth(-20)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: aura, alpha: 0.075, scale: 1.035, duration: 2600, ease: "Sine.InOut", yoyo: true, repeat: -1 });

      board.fillStyle(0x0c0c0e, 0.94);
      board.fillRoundedRect(boardLeft - 14, boardTop - 14, boardWidth + 28, boardHeight + 28, 24);
      board.lineStyle(5, 0x000000, 0.55);
      board.strokeRoundedRect(boardLeft - 17, boardTop - 10, boardWidth + 34, boardHeight + 34, 26);
      board.lineStyle(2, COLORS.primary, 0.72);
      board.strokeRoundedRect(boardLeft - 14, boardTop - 14, boardWidth + 28, boardHeight + 28, 24);
      board.lineStyle(1, 0xffffff, 0.23);
      board.strokeRoundedRect(boardLeft - 10, boardTop - 10, boardWidth + 20, boardHeight + 20, 20);
      board.lineStyle(1, 0xffffff, 0.13);

      for (let index = 1; index < GRID_SIZE; index += 1) {
        board.lineBetween(boardLeft + index * pieceWidth, boardTop, boardLeft + index * pieceWidth, boardTop + boardHeight);
        board.lineBetween(boardLeft, boardTop + index * pieceHeight, boardLeft + boardWidth, boardTop + index * pieceHeight);
      }

      const scanLine = this.add.rectangle(boardLeft + 4, BOARD_CENTER_Y, 2, boardHeight - 8, 0xd8c2ff, 0.16)
        .setDepth(-5)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: scanLine,
        x: boardLeft + boardWidth - 4,
        alpha: 0.04,
        duration: 4200,
        ease: "Sine.InOut",
        yoyo: true,
        repeat: -1,
      });
    }

    createPieceTextures(sourceKey) {
      const source = this.textures.get(sourceKey).getSourceImage();
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const sourceCellWidth = sourceWidth / GRID_SIZE;
      const sourceCellHeight = sourceHeight / GRID_SIZE;
      // 고정 저해상도 변환 없이 원본 이미지의 셀 해상도를 그대로 보존한다.
      const textureWidth = Math.max(1, Math.ceil(sourceCellWidth));
      const textureHeight = Math.max(1, Math.ceil(sourceCellHeight));

      for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let col = 0; col < GRID_SIZE; col += 1) {
          const id = row * GRID_SIZE + col;
          const key = `piece-${this.stage.id}-${id}`;
          const roundedKey = `${key}-rounded`;

          if (!this.textures.exists(key)) {
            // file:// 사진을 그리기 전에 텍스처를 등록해야 초기 픽셀 읽기가 허용된다.
            const texture = this.textures.createCanvas(key, textureWidth, textureHeight);
            const context = texture.getContext();
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(
              source,
              col * sourceCellWidth,
              row * sourceCellHeight,
              sourceCellWidth,
              sourceCellHeight,
              0,
              0,
              textureWidth,
              textureHeight,
            );
            texture.refresh();
            applyHighQualityFilter(this, key);
          }

          if (!this.textures.exists(roundedKey)) {
            const roundedTexture = this.textures.createCanvas(roundedKey, textureWidth, textureHeight);
            const roundedContext = roundedTexture.getContext();
            const inset = 2;
            const radius = Math.min(PIECE_CORNER_RADIUS, textureWidth / 5, textureHeight / 5);

            roundedContext.imageSmoothingEnabled = true;
            roundedContext.imageSmoothingQuality = "high";
            roundedContext.save();
            roundedContext.beginPath();
            roundedContext.roundRect(inset, inset, textureWidth - inset * 2, textureHeight - inset * 2, radius);
            roundedContext.clip();
            roundedContext.drawImage(
              source,
              col * sourceCellWidth,
              row * sourceCellHeight,
              sourceCellWidth,
              sourceCellHeight,
              0,
              0,
              textureWidth,
              textureHeight,
            );
            roundedContext.restore();
            roundedContext.beginPath();
            roundedContext.roundRect(inset, inset, textureWidth - inset * 2, textureHeight - inset * 2, radius);
            roundedContext.strokeStyle = "rgba(255, 255, 255, 0.72)";
            roundedContext.lineWidth = 3;
            roundedContext.stroke();
            roundedTexture.refresh();
            applyHighQualityFilter(this, roundedKey);
          }
        }
      }
    }

    createPieces() {
      const positions = this.createRandomPositions();
      for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let col = 0; col < GRID_SIZE; col += 1) {
          const id = row * GRID_SIZE + col;
          const position = positions[id];
          const gameObject = this.add.image(position.x, position.y, `piece-${this.stage.id}-${id}`)
            .setDisplaySize(this.boardLayout.pieceWidth, this.boardLayout.pieceHeight);
          gameObject.setInteractive({ draggable: true, useHandCursor: true });
          this.input.setDraggable(gameObject);
          gameObject.pieceData = {
            id,
            row,
            col,
            currentSlot: position.slotId,
            sourceRect: { row, col },
          };
          this.pieces.push(gameObject);
          this.slotOccupants[position.slotId] = id;
        }
      }
    }

    buildConnectionGraph() {
      const graph = Array.from({ length: PIECE_COUNT }, () => new Set());
      for (let slotId = 0; slotId < PIECE_COUNT; slotId += 1) {
        const pieceId = this.slotOccupants[slotId];
        const slotRow = Math.floor(slotId / GRID_SIZE);
        const slotCol = slotId % GRID_SIZE;
        const pieceRow = Math.floor(pieceId / GRID_SIZE);
        const pieceCol = pieceId % GRID_SIZE;

        if (slotCol < GRID_SIZE - 1 && pieceCol < GRID_SIZE - 1) {
          const rightPieceId = this.slotOccupants[slotId + 1];
          if (rightPieceId === pieceId + 1) {
            graph[pieceId].add(rightPieceId);
            graph[rightPieceId].add(pieceId);
          }
        }

        if (slotRow < GRID_SIZE - 1 && pieceRow < GRID_SIZE - 1) {
          const bottomPieceId = this.slotOccupants[slotId + GRID_SIZE];
          if (bottomPieceId === pieceId + GRID_SIZE) {
            graph[pieceId].add(bottomPieceId);
            graph[bottomPieceId].add(pieceId);
          }
        }
      }

      return graph;
    }

    getConnectedPieceIds() {
      const graph = this.buildConnectionGraph();
      return new Set(graph.flatMap((neighbors, pieceId) => (neighbors.size > 0 ? [pieceId] : [])));
    }

    getConnectedGroup(startPieceId) {
      const graph = this.buildConnectionGraph();
      const groupIds = [];
      const visited = new Set([startPieceId]);
      const pending = [startPieceId];

      while (pending.length > 0) {
        const pieceId = pending.shift();
        groupIds.push(pieceId);
        graph[pieceId].forEach((neighborId) => {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            pending.push(neighborId);
          }
        });
      }

      return groupIds;
    }

    updatePieceVisuals(animate = false) {
      const connectedIds = this.getConnectedPieceIds();
      const { pieceWidth, pieceHeight } = this.boardLayout;

      this.pieces.forEach((piece) => {
        const isConnected = connectedIds.has(piece.pieceData.id);
        const textureSuffix = isConnected ? "" : "-rounded";
        const targetWidth = pieceWidth - (isConnected ? 0 : PIECE_GAP);
        const targetHeight = pieceHeight - (isConnected ? 0 : PIECE_GAP);
        piece.setTexture(`piece-${this.stage.id}-${piece.pieceData.id}${textureSuffix}`);

        if (animate) {
          this.tweens.add({
            targets: piece,
            displayWidth: targetWidth,
            displayHeight: targetHeight,
            duration: 140,
            ease: "Cubic.Out",
          });
        } else {
          piece.setDisplaySize(targetWidth, targetHeight);
        }
      });
    }

    createRandomPositions() {
      const baseSlots = [];
      const { pieceWidth, pieceHeight } = this.boardLayout;
      for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let col = 0; col < GRID_SIZE; col += 1) {
          baseSlots.push({
            x: BOARD_CENTER_X + (col - 1) * pieceWidth,
            y: BOARD_CENTER_Y + (row - 1) * pieceHeight,
            slotId: row * GRID_SIZE + col,
          });
        }
      }

      const hasConnectedPair = (positions) => {
        const pieceSlots = positions.map((position) => position.slotId);
        for (let pieceId = 0; pieceId < PIECE_COUNT; pieceId += 1) {
          const pieceRow = Math.floor(pieceId / GRID_SIZE);
          const pieceCol = pieceId % GRID_SIZE;
          const slotId = pieceSlots[pieceId];
          const slotRow = Math.floor(slotId / GRID_SIZE);
          const slotCol = slotId % GRID_SIZE;

          if (
            pieceCol < GRID_SIZE - 1
            && slotCol < GRID_SIZE - 1
            && pieceSlots[pieceId + 1] === slotId + 1
          ) {
            return true;
          }

          if (
            pieceRow < GRID_SIZE - 1
            && slotRow < GRID_SIZE - 1
            && pieceSlots[pieceId + GRID_SIZE] === slotId + GRID_SIZE
          ) {
            return true;
          }
        }
        return false;
      };

      let positions = [...baseSlots];
      let attempts = 0;
      do {
        positions = Phaser.Utils.Array.Shuffle([...baseSlots]);
        attempts += 1;
      } while (hasConnectedPair(positions) && attempts < 300);

      // 무작위 재배치가 반복 실패해도 연결 조각이 없는 역순 배치로 안전하게 시작한다.
      if (hasConnectedPair(positions)) {
        positions = baseSlots.map((slot, pieceId) => baseSlots[PIECE_COUNT - 1 - pieceId]);
      }

      return positions;
    }

    bindDragEvents() {
      this.input.on("dragstart", (pointer, gameObject) => {
        if (this.isClearing || this.isSwapping || !gameObject.pieceData) {
          return;
        }
        const groupIds = this.getConnectedGroup(gameObject.pieceData.id);
        const members = groupIds.map((pieceId) => this.pieces[pieceId]);
        members.forEach((piece, index) => piece.setDepth(1000 + index));
        this.dragState = {
          pieceId: gameObject.pieceData.id,
          sourceSlot: gameObject.pieceData.currentSlot,
          startX: gameObject.x,
          startY: gameObject.y,
          members: members.map((piece) => ({
            piece,
            startX: piece.x,
            startY: piece.y,
            sourceSlot: piece.pieceData.currentSlot,
          })),
        };
      });

      this.input.on("drag", (pointer, gameObject, dragX, dragY) => {
        if (!this.dragState || this.isClearing || this.isSwapping || !gameObject.pieceData) {
          return;
        }
        const deltaX = dragX - this.dragState.startX;
        const deltaY = dragY - this.dragState.startY;
        this.dragState.members.forEach((member) => {
          member.piece.setPosition(member.startX + deltaX, member.startY + deltaY);
        });
      });

      this.input.on("dragend", (pointer, gameObject) => {
        if (!this.dragState || this.isClearing || !gameObject.pieceData) {
          return;
        }
        const dragState = this.dragState;
        const sourceSlot = dragState.sourceSlot;
        const requestedTargetSlot = this.getNearestSlot(gameObject.x, gameObject.y);
        const translation = this.getClampedGroupTranslation(dragState.members, sourceSlot, requestedTargetSlot);
        this.dragState = null;

        if (translation.row === 0 && translation.col === 0) {
          this.snapPieceGroup(dragState.members);
          return;
        }

        this.movePieceGroup(dragState.members, translation);
      });
    }

    getSlotCenter(slotId) {
      const row = Math.floor(slotId / GRID_SIZE);
      const col = slotId % GRID_SIZE;
      return {
        x: BOARD_CENTER_X + (col - 1) * this.boardLayout.pieceWidth,
        y: BOARD_CENTER_Y + (row - 1) * this.boardLayout.pieceHeight,
      };
    }

    getNearestSlot(x, y) {
      const { pieceWidth, pieceHeight } = this.boardLayout;
      const boardLeftCenter = BOARD_CENTER_X - pieceWidth;
      const boardTopCenter = BOARD_CENTER_Y - pieceHeight;
      const col = Phaser.Math.Clamp(Math.round((x - boardLeftCenter) / pieceWidth), 0, GRID_SIZE - 1);
      const row = Phaser.Math.Clamp(Math.round((y - boardTopCenter) / pieceHeight), 0, GRID_SIZE - 1);
      return row * GRID_SIZE + col;
    }

    getClampedGroupTranslation(members, sourceSlot, requestedTargetSlot) {
      const sourceRow = Math.floor(sourceSlot / GRID_SIZE);
      const sourceCol = sourceSlot % GRID_SIZE;
      const requestedRow = Math.floor(requestedTargetSlot / GRID_SIZE);
      const requestedCol = requestedTargetSlot % GRID_SIZE;
      const memberRows = members.map((member) => Math.floor(member.sourceSlot / GRID_SIZE));
      const memberCols = members.map((member) => member.sourceSlot % GRID_SIZE);
      const minRow = Math.min(...memberRows);
      const maxRow = Math.max(...memberRows);
      const minCol = Math.min(...memberCols);
      const maxCol = Math.max(...memberCols);

      return {
        row: Phaser.Math.Clamp(requestedRow - sourceRow, -minRow, GRID_SIZE - 1 - maxRow),
        col: Phaser.Math.Clamp(requestedCol - sourceCol, -minCol, GRID_SIZE - 1 - maxCol),
      };
    }

    tweenPiecesToSlots(assignments, onComplete) {
      this.isSwapping = true;
      let completedTweens = 0;
      assignments.forEach(({ piece, slotId }) => {
        const center = this.getSlotCenter(slotId);
        this.tweens.add({
          targets: piece,
          x: center.x,
          y: center.y,
          duration: 180,
          ease: "Cubic.Out",
          onComplete: () => {
            completedTweens += 1;
            if (completedTweens === assignments.length) {
              this.pieces.forEach((currentPiece) => currentPiece.setDepth(currentPiece.pieceData.id));
              this.isSwapping = false;
              onComplete();
            }
          },
        });
      });
    }

    snapPieceGroup(members) {
      const assignments = members.map((member) => ({ piece: member.piece, slotId: member.sourceSlot }));
      this.tweenPiecesToSlots(assignments, () => {});
    }

    movePieceGroup(members, translation) {
      const groupIds = new Set(members.map((member) => member.piece.pieceData.id));
      const sourceSlots = members.map((member) => member.sourceSlot);
      const targetSlots = members.map((member) => {
        const row = Math.floor(member.sourceSlot / GRID_SIZE) + translation.row;
        const col = (member.sourceSlot % GRID_SIZE) + translation.col;
        return row * GRID_SIZE + col;
      });
      const targetSlotSet = new Set(targetSlots);
      const vacatedSlots = sourceSlots.filter((slotId) => !targetSlotSet.has(slotId)).sort((a, b) => a - b);
      const displacedPieces = targetSlots
        .map((slotId) => this.pieces[this.slotOccupants[slotId]])
        .filter((piece, index, pieces) => (
          !groupIds.has(piece.pieceData.id)
          && pieces.findIndex((candidate) => candidate.pieceData.id === piece.pieceData.id) === index
        ))
        .sort((a, b) => a.pieceData.currentSlot - b.pieceData.currentSlot);
      const assignments = [];

      members.forEach((member, index) => {
        const targetSlot = targetSlots[index];
        member.piece.pieceData.currentSlot = targetSlot;
        assignments.push({ piece: member.piece, slotId: targetSlot });
      });
      displacedPieces.forEach((piece, index) => {
        const targetSlot = vacatedSlots[index];
        piece.pieceData.currentSlot = targetSlot;
        assignments.push({ piece, slotId: targetSlot });
      });

      this.slotOccupants = new Array(PIECE_COUNT).fill(null);
      this.pieces.forEach((piece) => {
        this.slotOccupants[piece.pieceData.currentSlot] = piece.pieceData.id;
      });

      this.tweenPiecesToSlots(assignments, () => {
        this.updatePieceVisuals(true);
        const movedGroupSize = this.getConnectedGroup(members[0].piece.pieceData.id).length;
        this.showSwapFeedback(movedGroupSize > 1 ? "LINKED" : "SNAPPED");
        this.checkSlotClearCondition();
      });
    }

    showSwapFeedback(label = "SNAPPED") {
      const pulse = this.add.circle(1030, 116, 18, COLORS.primary, 0.22)
        .setDepth(2999)
        .setBlendMode(Phaser.BlendModes.ADD);
      const feedback = addText(this, 1030, 116, label, {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "15px",
        fontStyle: "600",
        color: "#c9a7ff",
        letterSpacing: 2.4,
      }).setOrigin(0.5).setDepth(3000).setScale(0.55).setAlpha(0);
      this.tweens.add({ targets: pulse, scale: 5.2, alpha: 0, duration: 520, ease: "Cubic.Out", onComplete: () => pulse.destroy() });
      this.tweens.add({
        targets: feedback,
        alpha: 1,
        scale: 1,
        y: 124,
        duration: 210,
        yoyo: true,
        hold: 260,
        onComplete: () => feedback.destroy(),
      });
    }

    checkSlotClearCondition() {
      const isComplete = this.pieces.every((piece) => piece.pieceData.currentSlot === piece.pieceData.id);
      if (isComplete) {
        this.elapsedMs = Math.max(0, performance.now() - this.timerStartedAt);
        this.timerEvent?.remove(false);
        this.timerText?.setText(formatPuzzleTime(this.elapsedMs));
        this.isClearing = true;
        this.input.enabled = false;
        GAME_STATE.clearedStages.add(this.stage.id);
        this.time.delayedCall(450, () => {
          this.scene.start("ClearScene", { stageId: this.stage.id, elapsedMs: Math.floor(this.elapsedMs) });
        });
      }
    }
  }

  class ClearScene extends Phaser.Scene {
    constructor() {
      super("ClearScene");
    }

    init(data) {
      this.stage = getStage(data.stageId);
      this.elapsedMs = Math.max(0, Math.floor(Number(data.elapsedMs) || 0));
    }

    preload() {
      if (this.stage.useBundledImage && !this.textures.exists(stageTextureKey(this.stage.id))) {
        this.load.image(stageTextureKey(this.stage.id), this.stage.image);
      }
    }

    create() {
      configureHighResolutionCamera(this);
      addPremiumBackground(this, COLORS.primary);
      const textureKey = ensureStageTexture(this, this.stage);
      const eyebrow = addText(this, GAME_WIDTH / 2, 28, `EDITORIAL  ${String(this.stage.id).padStart(2, "0")}  /  COMPLETE`, {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "12px",
        fontStyle: "600",
        color: "#b98cff",
        letterSpacing: 2.7,
      }).setOrigin(0.5).setAlpha(0);
      const heading = addText(this, GAME_WIDTH / 2, 69, "Look revealed.", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "42px",
        fontStyle: "700",
        color: COLORS.text,
        letterSpacing: -1.6,
      }).setOrigin(0.5).setAlpha(0).setTint(0xffffff, 0xeee6ff, 0xffffff, 0xc9a7ff);
      this.tweens.add({ targets: eyebrow, alpha: 1, duration: 520, delay: 120 });
      this.tweens.add({ targets: heading, alpha: 1, y: 63, duration: 680, delay: 180, ease: "Cubic.Out" });
      addText(this, 1220, 28, "FINAL TIME", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "9px",
        fontStyle: "700",
        color: "#8f729f",
        letterSpacing: 1.8,
      }).setOrigin(1, 0.5);
      addText(this, 1220, 50, formatPuzzleTime(this.elapsedMs), {
        fontFamily: '"SFMono-Regular", Consolas, monospace',
        fontSize: "17px",
        fontStyle: "700",
        color: "#d9c4ff",
        letterSpacing: 1.1,
      }).setOrigin(1, 0.5);

      const source = this.textures.get(textureKey).getSourceImage();
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const imageCenterX = GAME_WIDTH / 2;
      const imageCenterY = 362;
      const maxWidth = 1040;
      const maxHeight = 510;
      const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
      const imageWidth = sourceWidth * scale;
      const imageHeight = sourceHeight * scale;
      const imageLeft = imageCenterX - imageWidth / 2;
      const imageRight = imageCenterX + imageWidth / 2;
      const imageTop = imageCenterY - imageHeight / 2;
      const imageBottom = imageCenterY + imageHeight / 2;
      const frame = this.add.graphics().setAlpha(0);
      drawRoundedPanel(frame, imageCenterX, imageCenterY, imageWidth + 30, imageHeight + 30, {
        radius: 30,
        fillColor: 0x090909,
        fillAlpha: 0.96,
        strokeColor: COLORS.primary,
        strokeAlpha: 0.68,
        lineWidth: 2,
        shadowAlpha: 0.58,
        highlightAlpha: 0.28,
      });
      const image = this.add.image(imageCenterX, imageCenterY, textureKey)
        .setScale(scale * 0.9)
        .setAlpha(0);
      const flash = this.add.rectangle(imageCenterX, imageCenterY, imageWidth, imageHeight, 0xffffff, 0).setDepth(20);

      const maxZoomFactor = 2;
      const zoomState = { factor: 1 };
      const zoomImage = this.add.image(imageCenterX, imageCenterY, textureKey)
        .setScale(scale)
        .setCrop(0, 0, sourceWidth, sourceHeight)
        .setAlpha(0)
        .setDepth(12);

      let isZooming = false;
      let zoomPointer = null;
      let cursorBeforeZoom = "";
      const updateZoomFocus = (pointer) => {
        zoomPointer = pointer;
        const zoomFactor = zoomState.factor;
        const zoomCropWidth = sourceWidth / zoomFactor;
        const zoomCropHeight = sourceHeight / zoomFactor;
        const focusX = Phaser.Math.Clamp(pointer.worldX, imageLeft, imageRight);
        const focusY = Phaser.Math.Clamp(pointer.worldY, imageTop, imageBottom);
        const sourceFocusX = ((focusX - imageLeft) / imageWidth) * sourceWidth;
        const sourceFocusY = ((focusY - imageTop) / imageHeight) * sourceHeight;
        const cropCenterX = Phaser.Math.Clamp(sourceFocusX, zoomCropWidth / 2, sourceWidth - zoomCropWidth / 2);
        const cropCenterY = Phaser.Math.Clamp(sourceFocusY, zoomCropHeight / 2, sourceHeight - zoomCropHeight / 2);
        zoomImage.setCrop(
          cropCenterX - zoomCropWidth / 2,
          cropCenterY - zoomCropHeight / 2,
          zoomCropWidth,
          zoomCropHeight,
        );
        zoomImage.setScale(scale * zoomFactor);
        zoomImage.setPosition(
          imageCenterX + (sourceWidth / 2 - cropCenterX) * scale * zoomFactor,
          imageCenterY + (sourceHeight / 2 - cropCenterY) * scale * zoomFactor,
        );
      };
      const beginZoom = (pointer) => {
        if (image.alpha < 0.95) return;
        isZooming = true;
        cursorBeforeZoom = this.game.canvas.style.cursor;
        this.game.canvas.style.cursor = "none";
        zoomImage.setAlpha(1);
        updateZoomFocus(pointer);
        this.tweens.killTweensOf(zoomState);
        this.tweens.add({
          targets: zoomState,
          factor: maxZoomFactor,
          duration: 200,
          ease: "Sine.InOut",
          onUpdate: () => updateZoomFocus(zoomPointer),
        });
      };
      const endZoom = () => {
        if (!isZooming) return;
        isZooming = false;
        this.game.canvas.style.cursor = cursorBeforeZoom || "default";
        this.tweens.killTweensOf(zoomState);
        this.tweens.add({
          targets: zoomState,
          factor: 1,
          duration: 200,
          ease: "Sine.InOut",
          onUpdate: () => updateZoomFocus(zoomPointer),
          onComplete: () => {
            zoomImage.setAlpha(0);
            zoomImage.setScale(scale).setPosition(imageCenterX, imageCenterY);
            zoomImage.setCrop(0, 0, sourceWidth, sourceHeight);
          },
        });
      };

      image.setInteractive();
      image.on("pointerdown", beginZoom);
      this.input.on("pointermove", (pointer) => {
        if (isZooming) updateZoomFocus(pointer);
      });
      this.input.on("pointerup", endZoom);
      this.input.on("gameout", endZoom);

      this.tweens.add({ targets: frame, alpha: 1, duration: 520, delay: 220 });
      this.tweens.add({ targets: image, alpha: 1, scale, duration: 760, delay: 220, ease: "Back.Out" });
      this.tweens.add({ targets: flash, alpha: 0.3, duration: 130, delay: 330, yoyo: true, ease: "Sine.Out" });

      for (let index = 0; index < 24; index += 1) {
        const angle = (Math.PI * 2 * index) / 24;
        const particle = this.add.circle(imageCenterX, imageCenterY, index % 4 === 0 ? 3 : 1.5, index % 3 === 0 ? COLORS.primary : COLORS.silver, 0)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: particle,
          x: imageCenterX + Math.cos(angle) * (410 + (index % 5) * 22),
          y: imageCenterY + Math.sin(angle) * (235 + (index % 4) * 18),
          alpha: { from: 0.85, to: 0 },
          scale: { from: 1, to: 0.2 },
          duration: 900 + (index % 6) * 90,
          delay: 300,
          ease: "Cubic.Out",
          onComplete: () => particle.destroy(),
        });
      }

      addButton(this, 505, 682, 230, 46, "BACK TO COLLECTION", () => this.scene.start("MenuScene"), {
        fillColor: COLORS.panelLight,
        hoverColor: COLORS.primaryDark,
        textColor: COLORS.text,
        strokeColor: 0xffffff,
        fontSize: "11px",
      });
      let savedEntry = null;
      const recordButton = addButton(this, 775, 682, 230, 46, "SAVE MY RECORD", () => {
        if (savedEntry) {
          showRankingPanel(this, this.stage.id, { title: "YOUR RESULT", highlightId: savedEntry.id });
          return;
        }
        showNicknamePrompt(this, this.elapsedMs, (nickname) => {
          savedEntry = saveRanking(this.stage.id, nickname, this.elapsedMs);
          const buttonText = recordButton.list.find((child) => child.type === "Text");
          buttonText?.setText("VIEW MY RANK");
          showRankingPanel(this, this.stage.id, { title: "YOUR RESULT", highlightId: savedEntry.id });
        });
      }, {
        fillColor: COLORS.primary,
        hoverColor: COLORS.accent,
        textColor: "#09070c",
        strokeColor: COLORS.accent,
        fontSize: "11px",
      });
      addText(this, GAME_WIDTH / 2, 642, "PRESS & HOLD TO ZOOM  ·  MOVE TO EXPLORE", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
        fontSize: "11px",
        fontStyle: "600",
        color: "#b98cff",
        letterSpacing: 1.45,
      }).setOrigin(0.5);

    }
  }

  const config = {
    // 브라우저는 file:// 이미지의 WebGL 텍스처 업로드를 차단할 수 있다.
    type: window.location.protocol === "file:" ? Phaser.CANVAS : Phaser.AUTO,
    loader: {
      imageLoadType: "HTMLImageElement",
    },
    parent: "game-container",
    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
    backgroundColor: COLORS.background,
    scene: [MenuScene, PuzzleScene, ClearScene],
    input: {
      activePointers: 2,
      touch: { capture: true },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH * RENDER_SCALE,
      height: GAME_HEIGHT * RENDER_SCALE,
    },
    render: {
      antialias: true,
      antialiasGL: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: "high-performance",
      mipmapFilter: "LINEAR",
    },
  };

  const game = new Phaser.Game(config);

  // 새로고침 또는 뒤로/앞으로 가기 캐시 복원 시 이전 클리어 표시를 남기지 않는다.
  window.addEventListener("pagehide", () => {
    GAME_STATE.clearedStages.clear();
  });

  window.addEventListener("pageshow", (event) => {
    GAME_STATE.clearedStages.clear();
    if (event.persisted && game.isBooted) {
      game.scene.start("MenuScene");
    }
  });
})();
