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

  /**
   * More words — word (Vietnamese), english, chinese, audio filenames per slot.
   * Female MP3s: docs/assets/audio/vietnamese/female/
   * Omit maleFile (or leave unset) until a male recording exists.
   */
  var VOCABULARY_ENTRIES = [
    { word: 'Không vấn đề', english: 'no problem', chinese: '没问题', femaleFile: 'ruby-noproblem.mp3' },
    { slot: 2, word: 'Cảm ơn', english: 'thank you', chinese: '感恩', femaleFile: 'ruby-vocab-2.mp3' },
    { slot: 3, word: 'xin lỗi', english: 'sorry', chinese: '', femaleFile: 'ruby-vocab-3.mp3' },
    { slot: 4, word: 'ngủ ngon', english: 'good night', chinese: '晚安', femaleFile: 'ruby-vocab-4.mp3' },
    { slot: 5, word: '', english: '', chinese: '', femaleFile: 'ruby-vocab-5.mp3' },
    { slot: 6, word: '', english: '', chinese: '', femaleFile: 'ruby-vocab-6.mp3' }
  ];

  function audioUrl(entry, voice) {
    if (voice === 'female') {
      if (!entry.femaleFile) return '';
      return FEMALE_AUDIO_BASE + entry.femaleFile;
    }
    if (!entry.maleFile) return '';
    return MALE_AUDIO_BASE + entry.maleFile;
  }

  function init() {
    var numbersBody = document.getElementById('vietnameseEntries');
    var vocabBody = document.getElementById('vocabularyEntries');
    var notice = document.getElementById('audioNotice');
    var player = document.getElementById('audioPlayer');
    if (!numbersBody || !vocabBody || !player) return;

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
      if (!url) {
        showNotice('No ' + voice + ' recording available for this entry yet.', false);
        return;
      }
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
      var labelWord = entry.word || ('vocabulary slot ' + (entry.slot || ''));
      btn.setAttribute('aria-label', 'Play ' + voice + ' pronunciation: ' + labelWord);
      if (!audioUrl(entry, voice)) {
        btn.disabled = true;
        btn.title = 'No ' + voice + ' recording available';
      }
      btn.addEventListener('click', function () {
        playVoice(entry, voice);
      });
      return btn;
    }

    function createVoiceCell(entry) {
      var td = document.createElement('td');
      td.className = 'word-cell';
      var wordText = document.createElement('strong');
      wordText.textContent = entry.word || '—';
      var actions = document.createElement('span');
      actions.className = 'voice-actions';
      actions.appendChild(createVoiceButton('male', entry));
      actions.appendChild(createVoiceButton('female', entry));
      td.appendChild(wordText);
      td.appendChild(actions);
      return td;
    }

    ENTRIES.forEach(function (entry) {
      var tr = document.createElement('tr');

      var tdNum = document.createElement('td');
      tdNum.textContent = String(entry.digit);
      var tdWord = createVoiceCell(entry);
      tr.appendChild(tdNum);
      tr.appendChild(tdWord);
      numbersBody.appendChild(tr);
    });

    function createVocabTextCell(value) {
      var td = document.createElement('td');
      td.textContent = value || '—';
      if (!value) td.className = 'placeholder-text';
      return td;
    }

    VOCABULARY_ENTRIES.forEach(function (entry) {
      var tr = document.createElement('tr');
      tr.appendChild(createVocabTextCell(entry.word));
      tr.appendChild(createVocabTextCell(entry.english));
      tr.appendChild(createVocabTextCell(entry.chinese));
      tr.appendChild(createVoiceCell(entry));
      vocabBody.appendChild(tr);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
