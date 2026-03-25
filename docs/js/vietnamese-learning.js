(function () {
  'use strict';

  /**
   * Audio source base URL.
   *
   * v1: Omniglot hotlink (absolute HTTPS). No MP3s in this repo.
   * To use committed files instead: put MP3s under e.g. docs/assets/audio/vietnamese/
   * and set AUDIO_BASE to a path relative to this HTML page, e.g.:
   *   var AUDIO_BASE = '../assets/audio/vietnamese/';
   * Then set each entry's `file` to your filename (e.g. 'mot.mp3'). Only commit audio
   * you recorded or have rights to publish.
   */
  var AUDIO_BASE = 'https://www.omniglot.com/soundfiles/vietnamese/numbers/';

  /** Native Vietnamese numerals 1–10; `file` must match Omniglot naming when using hotlink. */
  var ENTRIES = [
    { digit: 1, word: 'một', file: 'one_vietnamese.mp3' },
    { digit: 2, word: 'hai', file: 'two_vietnamese.mp3' },
    { digit: 3, word: 'ba', file: 'three_vietnamese.mp3' },
    { digit: 4, word: 'bốn', file: 'four_vietnamese.mp3' },
    { digit: 5, word: 'năm', file: 'five_vietnamese.mp3' },
    { digit: 6, word: 'sáu', file: 'six_vietnamese.mp3' },
    { digit: 7, word: 'bảy', file: 'seven_vietnamese.mp3' },
    { digit: 8, word: 'tám', file: 'eight_vietnamese.mp3' },
    { digit: 9, word: 'chín', file: 'nine_vietnamese.mp3' },
    { digit: 10, word: 'mười', file: 'ten_vietnamese.mp3' }
  ];

  function audioUrl(entry) {
    return AUDIO_BASE + entry.file;
  }

  function init() {
    var tbody = document.getElementById('vietnameseEntries');
    var notice = document.getElementById('audioNotice');
    var player = document.getElementById('audioPlayer');
    if (!tbody || !player) return;

    function clearNotice() {
      if (!notice) return;
      notice.textContent = '';
      notice.hidden = true;
      notice.className = 'audio-notice';
    }

    function showNotice(msg, isError) {
      if (!notice) return;
      notice.textContent = msg;
      notice.hidden = false;
      notice.className = 'audio-notice' + (isError ? ' audio-notice--error' : '');
    }

    player.addEventListener('error', function () {
      var err = player.error;
      var detail = err ? ' (code ' + err.code + ')' : '';
      showNotice('Could not play audio. The remote file may be unavailable or blocked.' + detail, true);
    });

    ENTRIES.forEach(function (entry) {
      var tr = document.createElement('tr');

      var tdNum = document.createElement('td');
      tdNum.textContent = String(entry.digit);

      var tdWord = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'word-btn';
      btn.textContent = entry.word;
      btn.setAttribute('aria-label', 'Play pronunciation: ' + entry.word);

      btn.addEventListener('click', function () {
        clearNotice();
        var url = audioUrl(entry);
        if (player.src !== url) {
          player.pause();
          player.src = url;
        }
        player.currentTime = 0;
        var p = player.play();
        if (p && typeof p.catch === 'function') {
          p.catch(function () {
            showNotice('Playback was blocked or failed. Try again.', true);
          });
        }
      });

      tdWord.appendChild(btn);
      tr.appendChild(tdNum);
      tr.appendChild(tdWord);
      tbody.appendChild(tr);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
