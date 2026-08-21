# PicSnap Playable Prototype

Phaser 3 CDN을 사용하는 정적 웹 퍼즐 게임 프로토타입입니다. 별도 빌드나 서버 애플리케이션은 필요하지 않습니다.

퍼즐은 화면 중앙의 고정된 3×3 보드 안에서 9개 조각의 시작 위치를 무작위로 섞어 생성합니다. 조각을 다른 칸으로 옮기면 해당 칸에 자동 정렬되고, 기존 조각과 위치가 교환됩니다.

## 실행

브라우저의 로컬 파일 제한을 피하려면 `D:\PicSnap`에서 정적 웹 서버를 실행한 뒤 접속하세요.

```powershell
python -m http.server 8000
```

그다음 `http://localhost:8000`을 엽니다.

## 실제 이미지 추가

현재 Stage 01과 Stage 02는 `assets/images`에 포함된 실제 이미지를 사용합니다.

1. 아래 파일을 추가합니다.
   - `assets/images/stage01.jpg`
   - `assets/images/stage02.jpg`
   - 필요 시 `stage03.jpg`부터 `stage06.jpg`까지 추가
2. `js/game.js`의 `STAGES` 항목에서 해당 스테이지의 `useBundledImage`를 `true`로 설정합니다.
3. 스테이지를 늘릴 때는 같은 데이터 형식으로 항목을 추가합니다.

이미지는 원본 가로세로 비율을 유지한 채 전체 영역이 3×3 조각으로 분할됩니다. 퍼즐 보드 테두리와 각 칸 크기도 이미지 비율에 맞춰 자동으로 변경됩니다.

## 추후 사운드 경로

- `assets/sounds/snap.mp3`
- `assets/sounds/combo.mp3`
- `assets/sounds/clear.mp3`
- `assets/sounds/bgm.mp3`

사운드 파일이 없어도 게임은 정상 동작합니다.
