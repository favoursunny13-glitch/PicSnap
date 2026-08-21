(() => {
  "use strict";

  if (typeof Phaser === "undefined") {
    console.error("Phaser가 로드되지 않았습니다. 네트워크 연결과 CDN 주소를 확인해 주세요.");
    return;
  }

  const GAME_WIDTH = 1280;
  const GAME_HEIGHT = 720;
  const GRID_SIZE = 3;
  const PIECE_COUNT = GRID_SIZE * GRID_SIZE;
  const PIECE_TEXTURE_SIZE = 256;
  const BOARD_CENTER_X = GAME_WIDTH / 2;
  const BOARD_CENTER_Y = 380;
  const MAX_BOARD_WIDTH = 640;
  const MAX_BOARD_HEIGHT = 470;

  const COLORS = {
    background: 0x08111f,
    panel: 0x101d31,
    panelLight: 0x172943,
    primary: 0x5ad7c8,
    primaryDark: 0x279c96,
    accent: 0xf6c453,
    text: "#f7fbff",
    muted: "#a9bbcf",
    success: 0x67df9a,
  };

  const STAGES = [
    {
      id: 1,
      title: "Stage 01",
      image: "./assets/images/stage01.jpg?v=20260821-2",
      thumbnail: "./assets/images/stage01.jpg?v=20260821-2",
      useBundledImage: true,
      demoAspect: 0.72,
      palette: ["#ff7b72", "#f6c453", "#5ad7c8", "#5b8def"],
    },
    {
      id: 2,
      title: "Stage 02",
      image: "./assets/images/stage02.jpg?v=20260821-2",
      thumbnail: "./assets/images/stage02.jpg?v=20260821-2",
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
    return key;
  }

  function getStage(stageId) {
    return STAGES.find((stage) => stage.id === stageId) || STAGES[0];
  }

  function addButton(scene, x, y, width, height, label, onClick, options = {}) {
    const fillColor = options.fillColor || COLORS.primary;
    const textColor = options.textColor || "#08111f";
    const container = scene.add.container(x, y);
    const background = scene.add.rectangle(0, 0, width, height, fillColor, 1)
      .setStrokeStyle(2, options.strokeColor || fillColor)
      .setInteractive({ useHandCursor: true });
    const text = scene.add.text(0, 0, label, {
      fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
      fontSize: options.fontSize || "24px",
      fontStyle: "bold",
      color: textColor,
    }).setOrigin(0.5);
    container.add([background, text]);

    background.on("pointerover", () => {
      container.setScale(1.035);
      background.setFillStyle(options.hoverColor || COLORS.accent);
    });
    background.on("pointerout", () => {
      container.setScale(1);
      background.setFillStyle(fillColor);
    });
    background.on("pointerdown", () => container.setScale(0.98));
    background.on("pointerup", () => {
      container.setScale(1.035);
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
      this.cameras.main.setBackgroundColor(COLORS.background);
      this.add.circle(160, 90, 270, COLORS.primaryDark, 0.10);
      this.add.circle(1150, 690, 360, COLORS.accent, 0.06);

      this.add.text(GAME_WIDTH / 2, 72, "PicSnap", {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "62px",
        fontStyle: "bold",
        color: COLORS.text,
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, 120, "조각을 드래그해 그림을 완성하세요", {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "22px",
        color: COLORS.muted,
      }).setOrigin(0.5);

      const cardWidth = 380;
      const cardHeight = 440;
      const gap = 42;
      const totalWidth = STAGES.length * cardWidth + (STAGES.length - 1) * gap;
      const startX = (GAME_WIDTH - totalWidth) / 2 + cardWidth / 2;

      STAGES.forEach((stage, index) => {
        const x = startX + index * (cardWidth + gap);
        const y = 385;
        const card = this.add.rectangle(x, y, cardWidth, cardHeight, COLORS.panel, 0.98)
          .setStrokeStyle(2, GAME_STATE.clearedStages.has(stage.id) ? COLORS.success : COLORS.panelLight)
          .setInteractive({ useHandCursor: true });
        const textureKey = ensureStageTexture(this, stage);
        const source = this.textures.get(textureKey).getSourceImage();
        const sourceWidth = source.naturalWidth || source.width;
        const sourceHeight = source.naturalHeight || source.height;
        const thumbnailScale = Math.min(320 / sourceWidth, 320 / sourceHeight);
        const image = this.add.image(x, y - 58, textureKey)
          .setDisplaySize(sourceWidth * thumbnailScale, sourceHeight * thumbnailScale);
        const shade = this.add.rectangle(x, y + 135, 320, 48, 0x08111f, 0.76);
        this.add.text(x, y + 135, stage.title, {
          fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
          fontSize: "25px",
          fontStyle: "bold",
          color: COLORS.text,
        }).setOrigin(0.5);

        if (GAME_STATE.clearedStages.has(stage.id)) {
          this.add.circle(x + 134, y - 192, 28, COLORS.success, 1);
          this.add.text(x + 134, y - 192, "✓", {
            fontSize: "28px",
            fontStyle: "bold",
            color: "#08111f",
          }).setOrigin(0.5);
        }

        const openStage = () => this.scene.start("PuzzleScene", { stageId: stage.id });
        [card, image, shade].forEach((object) => {
          object.setInteractive({ useHandCursor: true });
          object.on("pointerup", openStage);
          object.on("pointerover", () => card.setStrokeStyle(4, COLORS.primary));
          object.on("pointerout", () => card.setStrokeStyle(2, GAME_STATE.clearedStages.has(stage.id) ? COLORS.success : COLORS.panelLight));
        });
      });

      this.add.text(GAME_WIDTH / 2, 672, "원하는 스테이지를 선택하세요", {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "16px",
        color: "#71879f",
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
      this.cameras.main.setBackgroundColor(COLORS.background);
      this.add.rectangle(GAME_WIDTH / 2, 40, GAME_WIDTH, 80, COLORS.panel, 0.98).setDepth(2000);
      this.add.text(34, 40, this.stage.title, {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "28px",
        fontStyle: "bold",
        color: COLORS.text,
      }).setOrigin(0, 0.5).setDepth(2001);
      this.add.text(GAME_WIDTH / 2, 40, "다른 칸으로 옮기면 두 조각의 위치가 교환됩니다", {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "18px",
        color: COLORS.muted,
      }).setOrigin(0.5).setDepth(2001);
      addButton(this, 1180, 40, 150, 50, "메뉴", () => this.scene.start("MenuScene"), {
        fillColor: COLORS.panelLight,
        strokeColor: COLORS.primary,
        textColor: COLORS.text,
        fontSize: "20px",
      }).setDepth(2002);

      const textureKey = ensureStageTexture(this, this.stage);
      this.boardLayout = this.calculateBoardLayout(textureKey);
      this.createPieceTextures(textureKey);
      this.createBoardGrid();
      this.createPieces();
      this.bindDragEvents();
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

      board.fillStyle(COLORS.panel, 0.92);
      board.fillRoundedRect(boardLeft - 8, boardTop - 8, boardWidth + 16, boardHeight + 16, 14);
      board.lineStyle(3, COLORS.primary, 0.8);
      board.strokeRoundedRect(boardLeft - 8, boardTop - 8, boardWidth + 16, boardHeight + 16, 14);
      board.lineStyle(2, 0xffffff, 0.24);

      for (let index = 1; index < GRID_SIZE; index += 1) {
        board.lineBetween(boardLeft + index * pieceWidth, boardTop, boardLeft + index * pieceWidth, boardTop + boardHeight);
        board.lineBetween(boardLeft, boardTop + index * pieceHeight, boardLeft + boardWidth, boardTop + index * pieceHeight);
      }
    }

    createPieceTextures(sourceKey) {
      const source = this.textures.get(sourceKey).getSourceImage();
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const sourceCellWidth = sourceWidth / GRID_SIZE;
      const sourceCellHeight = sourceHeight / GRID_SIZE;
      const aspectRatio = sourceCellWidth / sourceCellHeight;
      const textureWidth = aspectRatio >= 1 ? PIECE_TEXTURE_SIZE : Math.max(1, Math.round(PIECE_TEXTURE_SIZE * aspectRatio));
      const textureHeight = aspectRatio >= 1 ? Math.max(1, Math.round(PIECE_TEXTURE_SIZE / aspectRatio)) : PIECE_TEXTURE_SIZE;

      for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let col = 0; col < GRID_SIZE; col += 1) {
          const id = row * GRID_SIZE + col;
          const key = `piece-${this.stage.id}-${id}`;
          if (this.textures.exists(key)) {
            continue;
          }
          const canvas = document.createElement("canvas");
          canvas.width = textureWidth;
          canvas.height = textureHeight;
          const context = canvas.getContext("2d");
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

    createRandomPositions() {
      const slots = [];
      const { pieceWidth, pieceHeight } = this.boardLayout;
      for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let col = 0; col < GRID_SIZE; col += 1) {
          slots.push({
            x: BOARD_CENTER_X + (col - 1) * pieceWidth,
            y: BOARD_CENTER_Y + (row - 1) * pieceHeight,
            slotId: row * GRID_SIZE + col,
          });
        }
      }

      // 완성 상태로 시작하지 않도록 최소 한 번은 위치가 섞인 배열을 만든다.
      do {
        Phaser.Utils.Array.Shuffle(slots);
      } while (slots.every((slot, pieceId) => slot.slotId === pieceId));

      return slots;
    }

    bindDragEvents() {
      this.input.on("dragstart", (pointer, gameObject) => {
        if (this.isClearing || this.isSwapping || !gameObject.pieceData) {
          return;
        }
        gameObject.setDepth(1000);
        this.dragState = {
          pieceId: gameObject.pieceData.id,
          sourceSlot: gameObject.pieceData.currentSlot,
        };
      });

      this.input.on("drag", (pointer, gameObject, dragX, dragY) => {
        if (!this.dragState || this.isClearing || this.isSwapping || !gameObject.pieceData) {
          return;
        }
        gameObject.setPosition(dragX, dragY);
      });

      this.input.on("dragend", (pointer, gameObject) => {
        if (!this.dragState || this.isClearing || !gameObject.pieceData) {
          return;
        }
        const sourceSlot = this.dragState.sourceSlot;
        const targetSlot = this.getNearestSlot(gameObject.x, gameObject.y);
        this.dragState = null;

        if (targetSlot === sourceSlot) {
          this.snapPieceToSlot(gameObject, sourceSlot);
          return;
        }

        this.swapSlotPieces(gameObject, sourceSlot, targetSlot);
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

    snapPieceToSlot(piece, slotId) {
      const center = this.getSlotCenter(slotId);
      this.isSwapping = true;
      this.tweens.add({
        targets: piece,
        x: center.x,
        y: center.y,
        duration: 160,
        ease: "Cubic.Out",
        onComplete: () => {
          piece.setDepth(piece.pieceData.id);
          this.isSwapping = false;
        },
      });
    }

    swapSlotPieces(draggedPiece, sourceSlot, targetSlot) {
      const targetPieceId = this.slotOccupants[targetSlot];
      const targetPiece = this.pieces[targetPieceId];
      const sourceCenter = this.getSlotCenter(sourceSlot);
      const targetCenter = this.getSlotCenter(targetSlot);

      this.isSwapping = true;
      this.slotOccupants[sourceSlot] = targetPieceId;
      this.slotOccupants[targetSlot] = draggedPiece.pieceData.id;
      draggedPiece.pieceData.currentSlot = targetSlot;
      targetPiece.pieceData.currentSlot = sourceSlot;

      this.tweens.add({
        targets: targetPiece,
        x: sourceCenter.x,
        y: sourceCenter.y,
        duration: 180,
        ease: "Cubic.Out",
      });
      this.tweens.add({
        targets: draggedPiece,
        x: targetCenter.x,
        y: targetCenter.y,
        duration: 180,
        ease: "Cubic.Out",
        onComplete: () => {
          this.pieces.forEach((piece) => piece.setDepth(piece.pieceData.id));
          this.isSwapping = false;
          this.showSwapFeedback();
          this.checkSlotClearCondition();
        },
      });
    }

    showSwapFeedback() {
      const feedback = this.add.text(GAME_WIDTH / 2, 118, "SWAP!", {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "34px",
        fontStyle: "bold",
        color: "#5ad7c8",
        stroke: "#08111f",
        strokeThickness: 8,
      }).setOrigin(0.5).setDepth(3000).setScale(0.55).setAlpha(0);
      this.tweens.add({
        targets: feedback,
        alpha: 1,
        scale: 1,
        y: 136,
        duration: 180,
        yoyo: true,
        hold: 220,
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
      this.cameras.main.setBackgroundColor(COLORS.background);
      const textureKey = ensureStageTexture(this, this.stage);
      this.add.text(GAME_WIDTH / 2, 60, "PUZZLE COMPLETE", {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "42px",
        fontStyle: "bold",
        color: "#f6c453",
      }).setOrigin(0.5);

      const source = this.textures.get(textureKey).getSourceImage();
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const maxWidth = 820;
      const maxHeight = 470;
      const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
      const image = this.add.image(GAME_WIDTH / 2, 330, textureKey)
        .setScale(scale * 0.92)
        .setAlpha(0);
      this.add.rectangle(GAME_WIDTH / 2, 330, sourceWidth * scale + 16, sourceHeight * scale + 16, 0x000000, 0)
        .setStrokeStyle(4, COLORS.primary, 0.9);
      this.tweens.add({ targets: image, alpha: 1, scale, duration: 600, ease: "Back.Out" });

      addButton(this, GAME_WIDTH / 2, 654, 250, 58, "나가기", () => this.scene.start("MenuScene"));
      this.add.text(GAME_WIDTH / 2, 590, "버튼을 눌러 메인 메뉴로 돌아갑니다", {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "17px",
        color: COLORS.muted,
      }).setOrigin(0.5);
    }
  }

  const config = {
    type: Phaser.AUTO,
    parent: "game-container",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: COLORS.background,
    scene: [MenuScene, PuzzleScene, ClearScene],
    input: {
      activePointers: 2,
      touch: { capture: true },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: true,
    },
  };

  new Phaser.Game(config);
})();
