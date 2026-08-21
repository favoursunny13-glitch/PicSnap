# PicSnap Playable Prototype

Phaser 3 CDN을 사용하는 정적 웹 퍼즐 게임 프로토타입입니다. 별도 빌드나 서버 애플리케이션은 필요하지 않습니다.

## 실행

브라우저의 로컬 파일 제한을 피하려면 `D:\PicSnap`에서 정적 웹 서버를 실행한 뒤 접속하세요.

```powershell
python -m http.server 8000
```

그다음 `http://localhost:8000`을 엽니다.

## 실제 이미지 추가

현재는 외부 이미지를 다운로드하지 않고 코드에서 생성한 데모 이미지 2개를 사용합니다.

1. 아래 파일을 추가합니다.
   - `assets/images/stage01.jpg`
   - `assets/images/stage02.jpg`
   - 필요 시 `stage03.jpg`부터 `stage06.jpg`까지 추가
2. `js/game.js`의 `STAGES` 항목에서 해당 스테이지의 `useBundledImage`를 `true`로 바꿉니다.
3. 스테이지를 늘릴 때는 같은 데이터 형식으로 항목을 추가합니다.

이미지는 중앙 기준 정사각형으로 크롭된 뒤 3×3 조각으로 분할됩니다. 클리어 화면에서는 원본 전체 비율로 표시됩니다.

## 추후 사운드 경로

- `assets/sounds/snap.mp3`
- `assets/sounds/combo.mp3`
- `assets/sounds/clear.mp3`
- `assets/sounds/bgm.mp3`

사운드 파일이 없어도 게임은 정상 동작합니다.
