(() => {
"use strict";
const koreaTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const formatTime = (value) => koreaTime.format(new Date(value)) + " (한국 시간)";

function fillPhotoDetail(dialog, entry, photoUrl, alt = "") {
  const photo = dialog.querySelector("#detail-photo");
  photo.src = photoUrl;
  photo.alt = alt;
  dialog.querySelector("#photo-title").textContent = entry.name;
  const time = dialog.querySelector("#photo-time");
  time.dateTime = entry.capturedAt;
  time.textContent = formatTime(entry.capturedAt);
  const comment = dialog.querySelector("#photo-comment");
  comment.textContent = entry.comment || "";
  comment.hidden = !comment.textContent;
}

Object.assign(window.PicSnapGuestbook ??= {}, { formatTime, fillPhotoDetail });
})();
