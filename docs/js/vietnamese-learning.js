(function () {
  'use strict';

  var MALE_AUDIO_BASE = 'https://www.omniglot.com/soundfiles/vietnamese/numbers/';
  var FEMALE_AUDIO_BASE = '../assets/audio/vietnamese/female/';

  /**
   * Native Vietnamese numerals 1–10.
   * Male uses Omniglot filenames; female uses local files: ruby-number-1.mp3 ... ruby-number-10.mp3
   */
  var ENTRIES = [
    { digit: 1, word: 'một', maleFile: 'one_vietnamese.mp3', femaleFile: 'ruby-number-1.mp3' },
    { digit: 2, word: 'hai', maleFile: 'two_vietnamese.mp3', femaleFile: 'ruby-number-2.mp3' },
    { digit: 3, word: 'ba', maleFile: 'three_vietnamese.mp3', femaleFile: 'ruby-number-3.mp3' },
    { digit: 4, word: 'bốn', maleFile: 'four_vietnamese.mp3', femaleFile: 'ruby-number-4.mp3' },
    { digit: 5, word: 'năm', maleFile: 'five_vietnamese.mp3', femaleFile: 'ruby-number-5.mp3' },
    { digit: 6, word: 'sáu', maleFile: 'six_vietnamese.mp3', femaleFile: 'ruby-number-6.mp3' },
    { digit: 7, word: 'bảy', maleFile: 'seven_vietnamese.mp3', femaleFile: 'ruby-number-7.mp3' },
    { digit: 8, word: 'tám', maleFile: 'eight_vietnamese.mp3', femaleFile: 'ruby-number-8.mp3' },
    { digit: 9, word: 'chín', maleFile: 'nine_vietnamese.mp3', femaleFile: 'ruby-number-9.mp3' },
    { digit: 10, word: 'mười', maleFile: 'ten_vietnamese.mp3', femaleFile: 'ruby-number-10.mp3' }
  ];

  function audioUrl(entry, voice) {
    if (voice === 'female') return FEMALE_AUDIO_BASE + entry.femaleFile;
    return MALE_AUDIO_BASE + entry.maleFile;
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
      showNotice('Could not play audio. Check that the selected voice file exists and is reachable.' + detail, true);
    });

    function playVoice(entry, voice) {
      clearNotice();
      var url = audioUrl(entry, voice);
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
    }

    function createVoiceButton(voice, entry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'voice-btn';
      btn.textContent = voice === 'female' ? 'Female' : 'Male';
      btn.setAttribute('aria-label', 'Play ' + voice + ' pronunciation: ' + entry.word);
      btn.addEventListener('click', function () {
        playVoice(entry, voice);
      });
      return btn;
    }

    ENTRIES.forEach(function (entry) {
      var tr = document.createElement('tr');

      var tdNum = document.createElement('td');
      tdNum.textContent = String(entry.digit);

      var tdWord = document.createElement('td');
      tdWord.className = 'word-cell';
      var wordText = document.createElement('strong');
      wordText.textContent = entry.word;
      var actions = document.createElement('span');
      actions.className = 'voice-actions';
      actions.appendChild(createVoiceButton('male', entry));
      actions.appendChild(createVoiceButton('female', entry));

      tdWord.appendChild(wordText);
      tdWord.appendChild(actions);
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
