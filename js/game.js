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
  const PIECE_DISPLAY_SIZE = 128;
  const PIECE_TEXTURE_SIZE = 256;
  const SNAP_THRESHOLD_RATIO = 0.24;
  // TODO: 실제 플레이 테스트 후 Snap Threshold 튜닝
  const SNAP_THRESHOLD = PIECE_DISPLAY_SIZE * SNAP_THRESHOLD_RATIO;

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
      image: "./assets/images/stage01.jpg",
      thumbnail: "./assets/images/stage01.jpg",
      useBundledImage: false,
      palette: ["#ff7b72", "#f6c453", "#5ad7c8", "#5b8def"],
    },
    {
      id: 2,
      title: "Stage 02",
      image: "./assets/images/stage02.jpg",
      thumbnail: "./assets/images/stage02.jpg",
      useBundledImage: false,
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
    canvas.width = 768;
    canvas.height = 768;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 768, 768);
    gradient.addColorStop(0, stage.palette[0]);
    gradient.addColorStop(0.38, stage.palette[1]);
    gradient.addColorStop(0.7, stage.palette[2]);
    gradient.addColorStop(1, stage.palette[3]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 768, 768);

    context.globalAlpha = 0.2;
    for (let i = 0; i < 12; i += 1) {
      context.beginPath();
      context.arc(80 + (i % 4) * 205, 90 + Math.floor(i / 4) * 270, 55 + i * 5, 0, Math.PI * 2);
      context.fillStyle = i % 2 ? "#ffffff" : "#08111f";
      context.fill();
    }
    context.globalAlpha = 1;

    context.fillStyle = "rgba(8, 17, 31, 0.70)";
    context.roundRect(120, 286, 528, 196, 32);
    context.fill();
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.font = "700 76px sans-serif";
    context.fillText("PicSnap", 384, 375);
    context.font = "500 32px sans-serif";
    context.fillText(stage.title, 384, 430);
    context.strokeStyle = "rgba(255,255,255,0.55)";
    context.lineWidth = 8;
    context.strokeRect(18, 18, 732, 732);

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
        const image = this.add.image(x, y - 58, textureKey).setDisplaySize(320, 320);
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
      this.groups = new Map();
      this.pieces = [];
      this.dragState = null;
      this.isClearing = false;
    }

    init(data) {
      this.stage = getStage(data.stageId);
      this.groups = new Map();
      this.pieces = [];
      this.dragState = null;
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
      this.add.text(GAME_WIDTH / 2, 40, "가까운 정답 조각끼리 스냅됩니다", {
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
      this.createPieceTextures(textureKey);
      this.createPieces();
      this.bindDragEvents();
    }

    createPieceTextures(sourceKey) {
      const source = this.textures.get(sourceKey).getSourceImage();
      const sourceWidth = source.naturalWidth || source.width;
      const sourceHeight = source.naturalHeight || source.height;
      const squareSize = Math.min(sourceWidth, sourceHeight);
      const cropX = (sourceWidth - squareSize) / 2;
      const cropY = (sourceHeight - squareSize) / 2;
      const sourceCellSize = squareSize / GRID_SIZE;

      for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let col = 0; col < GRID_SIZE; col += 1) {
          const id = row * GRID_SIZE + col;
          const key = `piece-${this.stage.id}-${id}`;
          if (this.textures.exists(key)) {
            continue;
          }
          const canvas = document.createElement("canvas");
          canvas.width = PIECE_TEXTURE_SIZE;
          canvas.height = PIECE_TEXTURE_SIZE;
          const context = canvas.getContext("2d");
          context.drawImage(
            source,
            cropX + col * sourceCellSize,
            cropY + row * sourceCellSize,
            sourceCellSize,
            sourceCellSize,
            0,
            0,
            PIECE_TEXTURE_SIZE,
            PIECE_TEXTURE_SIZE,
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
            .setDisplaySize(PIECE_DISPLAY_SIZE, PIECE_DISPLAY_SIZE);
          gameObject.setInteractive({ draggable: true, useHandCursor: true });
          this.input.setDraggable(gameObject);
          gameObject.pieceData = {
            id,
            row,
            col,
            groupId: id,
            sourceRect: { row, col },
          };
          this.pieces.push(gameObject);
          this.groups.set(id, { id, members: new Set([id]) });
        }
      }
    }

    createRandomPositions() {
      const slots = [];
      const xValues = [150, 395, 640, 885, 1130];
      const yValues = [225, 535];
      yValues.forEach((y) => {
        xValues.forEach((x) => {
          slots.push({
            x: x + Phaser.Math.Between(-24, 24),
            y: y + Phaser.Math.Between(-32, 32),
          });
        });
      });
      Phaser.Utils.Array.Shuffle(slots);
      return slots.slice(0, PIECE_COUNT);
    }

    bindDragEvents() {
      this.input.on("dragstart", (pointer, gameObject) => {
        if (this.isClearing || !gameObject.pieceData) {
          return;
        }
        const groupId = gameObject.pieceData.groupId;
        const group = this.groups.get(groupId);
        const starts = new Map();
        group.members.forEach((pieceId) => {
          const piece = this.pieces[pieceId];
          starts.set(pieceId, { x: piece.x, y: piece.y });
          piece.setDepth(1000 + pieceId);
        });
        this.dragState = {
          groupId,
          pointerStart: { x: pointer.worldX, y: pointer.worldY },
          starts,
        };
      });

      this.input.on("drag", (pointer, gameObject) => {
        if (!this.dragState || this.isClearing || !gameObject.pieceData) {
          return;
        }
        const deltaX = pointer.worldX - this.dragState.pointerStart.x;
        const deltaY = pointer.worldY - this.dragState.pointerStart.y;
        this.dragState.starts.forEach((start, pieceId) => {
          this.pieces[pieceId].setPosition(start.x + deltaX, start.y + deltaY);
        });
      });

      this.input.on("dragend", () => {
        if (!this.dragState || this.isClearing) {
          return;
        }
        const groupId = this.dragState.groupId;
        this.dragState = null;
        const snapCount = this.resolveChainSnaps(groupId);
        this.normalizeDepths();
        if (snapCount > 0) {
          this.showSnapFeedback(snapCount);
        }
        this.checkClearCondition(groupId);
        // TODO: 오답 Drop 정책은 기획 최종 결정에 따라 변경 가능
      });
    }

    resolveChainSnaps(movingGroupId) {
      let snapCount = 0;
      let safetyCount = 0;
      while (safetyCount < PIECE_COUNT) {
        safetyCount += 1;
        const candidate = this.findBestSnap(movingGroupId);
        if (!candidate) {
          break;
        }
        this.translateGroup(movingGroupId, candidate.deltaX, candidate.deltaY);
        this.mergeGroups(movingGroupId, candidate.targetGroupId);
        snapCount += 1;
      }
      return snapCount;
    }

    findBestSnap(movingGroupId) {
      const movingGroup = this.groups.get(movingGroupId);
      if (!movingGroup) {
        return null;
      }
      let best = null;
      movingGroup.members.forEach((movingPieceId) => {
        const movingPiece = this.pieces[movingPieceId];
        this.groups.forEach((targetGroup, targetGroupId) => {
          if (targetGroupId === movingGroupId) {
            return;
          }
          targetGroup.members.forEach((targetPieceId) => {
            const targetPiece = this.pieces[targetPieceId];
            const rowDifference = movingPiece.pieceData.row - targetPiece.pieceData.row;
            const colDifference = movingPiece.pieceData.col - targetPiece.pieceData.col;
            if (Math.abs(rowDifference) + Math.abs(colDifference) !== 1) {
              return;
            }
            const expectedX = targetPiece.x + colDifference * PIECE_DISPLAY_SIZE;
            const expectedY = targetPiece.y + rowDifference * PIECE_DISPLAY_SIZE;
            const deltaX = expectedX - movingPiece.x;
            const deltaY = expectedY - movingPiece.y;
            const distance = Math.hypot(deltaX, deltaY);
            if (distance <= SNAP_THRESHOLD && (!best || distance < best.distance)) {
              best = { targetGroupId, deltaX, deltaY, distance };
            }
          });
        });
      });
      return best;
    }

    translateGroup(groupId, deltaX, deltaY) {
      const group = this.groups.get(groupId);
      group.members.forEach((pieceId) => {
        const piece = this.pieces[pieceId];
        piece.setPosition(piece.x + deltaX, piece.y + deltaY);
      });
    }

    mergeGroups(primaryGroupId, absorbedGroupId) {
      const primary = this.groups.get(primaryGroupId);
      const absorbed = this.groups.get(absorbedGroupId);
      if (!primary || !absorbed || primaryGroupId === absorbedGroupId) {
        return;
      }
      absorbed.members.forEach((pieceId) => {
        primary.members.add(pieceId);
        this.pieces[pieceId].pieceData.groupId = primaryGroupId;
      });
      this.groups.delete(absorbedGroupId);
      this.calculateGroupScale(primary);
    }

    calculateGroupScale(group) {
      // TODO: 기획 확정 후 그룹 크기 변화 규칙 구현
      return group ? 1 : 1;
    }

    normalizeDepths() {
      this.pieces.forEach((piece, index) => piece.setDepth(index));
    }

    showSnapFeedback(snapCount) {
      const isChain = snapCount >= 2;
      const label = isChain ? `${snapCount} CHAIN SNAP!` : "SNAP!";
      const color = isChain ? "#f6c453" : "#5ad7c8";
      const feedback = this.add.text(GAME_WIDTH / 2, 118, label, {
        fontFamily: 'Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: isChain ? "42px" : "34px",
        fontStyle: "bold",
        color,
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
        hold: isChain ? 520 : 260,
        onComplete: () => feedback.destroy(),
      });
    }

    checkClearCondition(groupId) {
      const group = this.groups.get(groupId);
      if (this.groups.size === 1 && group && group.members.size === PIECE_COUNT) {
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
