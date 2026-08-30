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
  const GRID_SIZE = 3;
  const PIECE_COUNT = GRID_SIZE * GRID_SIZE;
  const BOARD_CENTER_X = GAME_WIDTH / 2;
  const BOARD_CENTER_Y = 380;
  const MAX_BOARD_WIDTH = 640;
  const MAX_BOARD_HEIGHT = 470;
  const PIECE_GAP = 8;
  const PIECE_CORNER_RADIUS = 14;

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
      image: window.PICSNAP_STAGE_IMAGES?.[1] || "./assets/images/stage01.jpg?v=20260830-1",
      thumbnail: "./assets/images/stage01.jpg?v=20260830-1",
      useBundledImage: true,
      demoAspect: 0.72,
      palette: ["#ff7b72", "#f6c453", "#5ad7c8", "#5b8def"],
    },
    {
      id: 2,
      title: "Stage 02",
      image: window.PICSNAP_STAGE_IMAGES?.[2] || "./assets/images/stage02.jpg?v=20260830-1",
      thumbnail: "./assets/images/stage02.jpg?v=20260830-1",
      useBundledImage: true,
      demoAspect: 1.5,
      palette: ["#9b7bff", "#55c2ff", "#67df9a", "#f28cc8"],
    },
  ];

  const GAME_STATE = {
    clearedStages: new Set(),
  };

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

  function sharpenTextObject(gameObject) {
    if (gameObject?.type === "Text" && typeof gameObject.setResolution === "function") {
      gameObject.setResolution(TEXT_RESOLUTION);
    }
    if (Array.isArray(gameObject?.list)) {
      gameObject.list.forEach(sharpenTextObject);
    }
  }

  function sharpenSceneText(scene) {
    scene.children.list.forEach(sharpenTextObject);
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
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext("2d");
    const blurAmount = Math.max(3, Math.round(Math.min(sourceWidth, sourceHeight) * 0.008));

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = `blur(${blurAmount}px)`;
    context.drawImage(
      source,
      -blurAmount,
      -blurAmount,
      sourceWidth + blurAmount * 2,
      sourceHeight + blurAmount * 2,
    );
    context.filter = "none";
    scene.textures.addCanvas(blurredKey, canvas);
    applyHighQualityFilter(scene, blurredKey);
    return blurredKey;
  }

  function getStage(stageId) {
    return STAGES.find((stage) => stage.id === stageId) || STAGES[0];
  }

  function addPremiumBackground(scene, accentColor = COLORS.primary) {
    scene.cameras.main.setBackgroundColor(COLORS.background);
    scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.background, 1).setDepth(-100);

    const leftGlow = scene.add.circle(-40, 190, 390, accentColor, 0.115)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-90);
    const rightGlow = scene.add.circle(1320, 530, 440, 0x777780, 0.095)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-90);
    scene.tweens.add({
      targets: leftGlow,
      x: 65,
      y: 235,
      scale: 1.16,
      alpha: 0.065,
      duration: 6200,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });
    scene.tweens.add({
      targets: rightGlow,
      x: 1195,
      y: 475,
      scale: 0.88,
      duration: 7600,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });

    const edgeDetails = scene.add.graphics().setDepth(-70);
    edgeDetails.lineStyle(1, accentColor, 0.22);
    edgeDetails.lineBetween(24, 96, 24, 286);
    edgeDetails.lineBetween(24, 434, 24, 624);
    edgeDetails.strokeCircle(-95, GAME_HEIGHT / 2, 315);
    edgeDetails.lineStyle(1, 0xd7d7dc, 0.14);
    edgeDetails.lineBetween(GAME_WIDTH - 24, 96, GAME_WIDTH - 24, 286);
    edgeDetails.lineBetween(GAME_WIDTH - 24, 434, GAME_WIDTH - 24, 624);
    edgeDetails.strokeCircle(GAME_WIDTH + 110, GAME_HEIGHT / 2, 340);
    edgeDetails.fillStyle(accentColor, 0.58);
    edgeDetails.fillCircle(24, 360, 2.5);
    edgeDetails.fillCircle(GAME_WIDTH - 24, 360, 2.5);

    scene.add.text(23, GAME_HEIGHT / 2, "FASHION  /  IMAGE  /  PLAY", {
      fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
      fontSize: "9px",
      color: "#8a8a90",
      letterSpacing: 2.1,
    }).setOrigin(0.5).setAngle(-90).setDepth(-60).setAlpha(0.58);
    scene.add.text(GAME_WIDTH - 23, GAME_HEIGHT / 2, "PICSNAP  /  EDITORIAL", {
      fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
      fontSize: "9px",
      color: "#8a8a90",
      letterSpacing: 2.1,
    }).setOrigin(0.5).setAngle(90).setDepth(-60).setAlpha(0.58);

    for (let index = 0; index < 18; index += 1) {
      const dot = scene.add.circle(
        40 + ((index * 173) % 1200),
        100 + ((index * 97) % 570),
        index % 3 === 0 ? 1.5 : 1,
        index % 4 === 0 ? accentColor : 0xffffff,
        index % 4 === 0 ? 0.28 : 0.11,
      ).setDepth(-80);
      scene.tweens.add({
        targets: dot,
        y: dot.y - 18 - (index % 4) * 5,
        alpha: dot.alpha * 0.35,
        duration: 2400 + index * 170,
        ease: "Sine.InOut",
        yoyo: true,
        repeat: -1,
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
    const text = scene.add.text(0, 0, label, {
      fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
      fontSize: options.fontSize || "24px",
      fontStyle: "600",
      color: textColor,
      letterSpacing: 0.3,
    }).setOrigin(0.5).setResolution(TEXT_RESOLUTION);
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

      const eyebrow = this.add.text(GAME_WIDTH / 2, 48, "PICSNAP  /  FASHION PUZZLE", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "13px",
        fontStyle: "600",
        color: "#b98cff",
        letterSpacing: 3.2,
      }).setOrigin(0.5).setAlpha(0);
      const title = this.add.text(GAME_WIDTH / 2, 92, "Reveal the look.", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
        fontSize: "54px",
        fontStyle: "700",
        color: COLORS.text,
        letterSpacing: -2.2,
      }).setOrigin(0.5).setAlpha(0).setTint(0xffffff, 0xf0e8ff, 0xffffff, 0xc9a7ff);
      const subtitle = this.add.text(GAME_WIDTH / 2, 137, "조각을 연결하고, 감춰진 패션 룩을 완성하세요.", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
        fontSize: "18px",
        color: COLORS.muted,
        letterSpacing: -0.2,
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: eyebrow, alpha: 1, y: 42, duration: 650, ease: "Cubic.Out" });
      this.tweens.add({ targets: title, alpha: 1, y: 84, duration: 760, delay: 90, ease: "Cubic.Out" });
      this.tweens.add({ targets: subtitle, alpha: 1, duration: 700, delay: 180, ease: "Cubic.Out" });

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
        const thumbnailScale = Math.min(326 / sourceWidth, 284 / sourceHeight);
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
        const lookLabel = this.add.text(-164, -194, `LOOK  ${String(stage.id).padStart(2, "0")}`, {
          fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
          fontSize: "12px",
          fontStyle: "600",
          color: isCleared ? "#d6c7ff" : "#b98cff",
          letterSpacing: 2.4,
        }).setOrigin(0, 0.5);
        const stageTitle = this.add.text(-164, 155, stage.title.replace("Stage", "Editorial"), {
          fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
          fontSize: "24px",
          fontStyle: "600",
          color: COLORS.text,
          letterSpacing: -0.4,
        }).setOrigin(0, 0.5);
        const status = this.add.text(164, 156, isCleared ? "REVEALED  ✓" : "DISCOVER  →", {
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

      this.add.text(GAME_WIDTH / 2, 665, "SELECT A LOOK  ·  DRAG TO REVEAL", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "11px",
        color: "#6e6e73",
        letterSpacing: 2.2,
      }).setOrigin(0.5);

      sharpenSceneText(this);

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
    }

    init(data) {
      this.stage = getStage(data.stageId);
      this.pieces = [];
      this.slotOccupants = new Array(PIECE_COUNT).fill(null);
      this.dragState = null;
      this.isSwapping = false;
      this.isClearing = false;
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
      this.add.text(48, 31, `LOOK  ${String(this.stage.id).padStart(2, "0")}`, {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "11px",
        fontStyle: "600",
        color: "#b98cff",
        letterSpacing: 2.3,
      }).setOrigin(0, 0.5).setDepth(2001);
      this.add.text(48, 51, this.stage.title.replace("Stage", "Editorial"), {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "21px",
        fontStyle: "600",
        color: COLORS.text,
      }).setOrigin(0, 0.5).setDepth(2001);
      this.add.text(GAME_WIDTH / 2, 40, "맞는 조각은 연결되며, 연결된 조각은 함께 움직입니다", {
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

      sharpenSceneText(this);

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
            const canvas = document.createElement("canvas");
            canvas.width = textureWidth;
            canvas.height = textureHeight;
            const context = canvas.getContext("2d");
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
            this.textures.addCanvas(key, canvas);
            applyHighQualityFilter(this, key);
          }

          if (!this.textures.exists(roundedKey)) {
            const roundedCanvas = document.createElement("canvas");
            roundedCanvas.width = textureWidth;
            roundedCanvas.height = textureHeight;
            const roundedContext = roundedCanvas.getContext("2d");
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
            this.textures.addCanvas(roundedKey, roundedCanvas);
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
      const pulse = this.add.circle(GAME_WIDTH / 2, 116, 18, COLORS.primary, 0.22)
        .setDepth(2999)
        .setBlendMode(Phaser.BlendModes.ADD);
      const feedback = this.add.text(GAME_WIDTH / 2, 116, label, {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "15px",
        fontStyle: "600",
        color: "#c9a7ff",
        letterSpacing: 2.4,
      }).setOrigin(0.5).setDepth(3000).setScale(0.55).setAlpha(0).setResolution(TEXT_RESOLUTION);
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
        this.isClearing = true;
        this.input.enabled = false;
        GAME_STATE.clearedStages.add(this.stage.id);
        this.time.delayedCall(450, () => {
          this.scene.start("ClearScene", { stageId: this.stage.id });
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
      const eyebrow = this.add.text(GAME_WIDTH / 2, 38, `EDITORIAL  ${String(this.stage.id).padStart(2, "0")}  /  COMPLETE`, {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "12px",
        fontStyle: "600",
        color: "#b98cff",
        letterSpacing: 2.7,
      }).setOrigin(0.5).setAlpha(0);
      const heading = this.add.text(GAME_WIDTH / 2, 83, "Look revealed.", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, sans-serif',
        fontSize: "46px",
        fontStyle: "700",
        color: COLORS.text,
        letterSpacing: -1.6,
      }).setOrigin(0.5).setAlpha(0).setTint(0xffffff, 0xeee6ff, 0xffffff, 0xc9a7ff);
      this.tweens.add({ targets: eyebrow, alpha: 1, duration: 520, delay: 120 });
      this.tweens.add({ targets: heading, alpha: 1, y: 76, duration: 680, delay: 180, ease: "Cubic.Out" });

      const source = this.textures.get(textureKey).getSourceImage();
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const maxWidth = 820;
      const maxHeight = 455;
      const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
      const frame = this.add.graphics().setAlpha(0);
      drawRoundedPanel(frame, GAME_WIDTH / 2, 348, sourceWidth * scale + 30, sourceHeight * scale + 30, {
        radius: 30,
        fillColor: 0x090909,
        fillAlpha: 0.96,
        strokeColor: COLORS.primary,
        strokeAlpha: 0.68,
        lineWidth: 2,
        shadowAlpha: 0.58,
        highlightAlpha: 0.28,
      });
      const image = this.add.image(GAME_WIDTH / 2, 348, textureKey)
        .setScale(scale * 0.9)
        .setAlpha(0);
      const flash = this.add.rectangle(GAME_WIDTH / 2, 348, sourceWidth * scale, sourceHeight * scale, 0xffffff, 0).setDepth(20);
      this.tweens.add({ targets: frame, alpha: 1, duration: 520, delay: 220 });
      this.tweens.add({ targets: image, alpha: 1, scale, duration: 760, delay: 220, ease: "Back.Out" });
      this.tweens.add({ targets: flash, alpha: 0.3, duration: 130, delay: 330, yoyo: true, ease: "Sine.Out" });

      for (let index = 0; index < 24; index += 1) {
        const angle = (Math.PI * 2 * index) / 24;
        const particle = this.add.circle(GAME_WIDTH / 2, 348, index % 4 === 0 ? 3 : 1.5, index % 3 === 0 ? COLORS.primary : COLORS.silver, 0)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: particle,
          x: GAME_WIDTH / 2 + Math.cos(angle) * (360 + (index % 5) * 22),
          y: 348 + Math.sin(angle) * (215 + (index % 4) * 18),
          alpha: { from: 0.85, to: 0 },
          scale: { from: 1, to: 0.2 },
          duration: 900 + (index % 6) * 90,
          delay: 300,
          ease: "Cubic.Out",
          onComplete: () => particle.destroy(),
        });
      }

      addButton(this, GAME_WIDTH / 2, 665, 260, 52, "BACK TO COLLECTION", () => this.scene.start("MenuScene"), { fontSize: "12px" });
      this.add.text(GAME_WIDTH / 2, 621, "원본 화질로 공개된 패션 룩", {
        fontFamily: '-apple-system, BlinkMacSystemFont, Pretendard, "Noto Sans KR", sans-serif',
        fontSize: "14px",
        color: COLORS.muted,
        letterSpacing: 0.2,
      }).setOrigin(0.5);

      sharpenSceneText(this);

    }
  }

  const config = {
    type: Phaser.AUTO,
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
