/**
 * Accenture MCQ Quiz Application
 */

const STORAGE_KEY = 'accenture_mcq_session_v3';
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// State
let allQuestions = [];
let categories = ['All domains'];
let quizSession = {
  questions: [],
  currentIndex: 0,
  answers: {}, // { [index]: { selectedText, selectedLetter, isCorrect, correctLetter, correctText, isTimeout } }
  score: 0,
  category: 'All domains',
  timerDuration: 25,
  shuffleQ: false,
  shuffleO: false,
};

let timerInterval = null;
let autoAdvanceTimeout = null;
let remainingTime = 25;
let currentReviewFilter = 'all';

// DOM Elements
const $ = (id) => document.getElementById(id);

// Utilities
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Data initialization
async function initApp() {
  try {
    const res = await fetch('./questions.json');
    if (!res.ok) throw new Error('Failed to load questions.json');
    allQuestions = await res.json();
  } catch (err) {
    console.error('Error fetching questions.json:', err);
    $('startDesc').textContent = 'Error loading questions. Please ensure questions.json is available.';
    return;
  }

  // Extract unique categories
  const catSet = new Set(allQuestions.map((q) => q.category).filter(Boolean));
  categories = ['All domains', ...Array.from(catSet)];

  populateCategorySelect();
  setupEventListeners();
  checkSavedProgress();
}

function populateCategorySelect() {
  const select = $('domainSelect');
  select.innerHTML = categories
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join('');
}

function checkSavedProgress() {
  const saved = loadSession();
  const banner = $('continueBanner');
  if (saved && saved.questions && saved.questions.length > 0) {
    const answeredCount = Object.keys(saved.answers || {}).length;
    if (answeredCount < saved.questions.length) {
      $('continueText').textContent = `Question ${saved.currentIndex + 1} of ${saved.questions.length} · ${saved.category} (${answeredCount} answered)`;
      banner.classList.add('active');
      return;
    }
  }
  banner.classList.remove('active');
}

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizSession));
  } catch (e) {
    console.warn('Unable to save progress to localStorage', e);
  }
}

function loadSession() {
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

// Quiz Lifecycle
function startQuiz(resume = false) {
  clearAllTimers();

  if (resume) {
    const saved = loadSession();
    if (saved) {
      quizSession = saved;
    } else {
      initNewQuizSession();
    }
  } else {
    initNewQuizSession();
  }

  $('startView').classList.add('hidden');
  $('resultView').classList.add('hidden');
  $('quizView').classList.remove('hidden');

  renderNavGrid();
  renderCurrentQuestion();
}

function initNewQuizSession() {
  const selectedCat = $('domainSelect').value;
  const shuffleQ = $('shuffleQ').checked;
  const shuffleO = $('shuffleO').checked;
  const timerSec = parseInt($('timerSelect').value, 10) || 25;

  let pool = selectedCat === 'All domains'
    ? [...allQuestions]
    : allQuestions.filter((q) => q.category === selectedCat);

  if (shuffleQ) {
    pool = shuffleArray(pool);
  }

  // Prepare each question with stable options and correct reference
  const preparedQuestions = pool.map((q) => {
    const originalAnswerIndex = q.answer.charCodeAt(0) - 65;
    const originalCorrectText = q.options[originalAnswerIndex] || q.options[0];

    let optionItems = q.options.map((optText) => ({
      text: optText,
      isCorrect: optText === originalCorrectText,
    }));

    if (shuffleO) {
      optionItems = shuffleArray(optionItems);
    }

    // Assign final letters A, B, C, D... to the active display options
    const displayOptions = optionItems.map((opt, i) => ({
      letter: KEYS[i] || String.fromCharCode(65 + i),
      text: opt.text,
      isCorrect: opt.isCorrect,
    }));

    const correctOption = displayOptions.find((o) => o.isCorrect) || displayOptions[0];

    return {
      id: q.id,
      question: q.question,
      category: q.category,
      page: q.page,
      displayOptions,
      correctLetter: correctOption.letter,
      correctText: correctOption.text,
    };
  });

  quizSession = {
    questions: preparedQuestions,
    currentIndex: 0,
    answers: {},
    score: 0,
    category: selectedCat,
    timerDuration: timerSec,
    shuffleQ,
    shuffleO,
  };

  saveSession();
}

function renderNavGrid() {
  const container = $('navGrid');
  container.innerHTML = quizSession.questions
    .map((_, i) => `<button class="nav-dot" id="dot-${i}" data-index="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`)
    .join('');

  container.querySelectorAll('.nav-dot').forEach((btn) => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.index, 10);
      jumpToQuestion(idx);
    };
  });
}

function updateNavGrid() {
  quizSession.questions.forEach((_, i) => {
    const dot = $(`dot-${i}`);
    if (!dot) return;

    dot.className = 'nav-dot';
    if (i === quizSession.currentIndex) {
      dot.classList.add('current');
    }

    const answer = quizSession.answers[i];
    if (answer) {
      if (answer.isCorrect) {
        dot.classList.add('answered-correct');
      } else {
        dot.classList.add('answered-incorrect');
      }
    }
  });
}

function renderCurrentQuestion() {
  clearAllTimers();

  const q = quizSession.questions[quizSession.currentIndex];
  if (!q) return;

  const total = quizSession.questions.length;
  const curr = quizSession.currentIndex + 1;
  const answeredCount = Object.keys(quizSession.answers).length;

  // Sidebar stats
  $('sideQuestionNum').textContent = `${curr} / ${total}`;
  $('sideScore').textContent = `${quizSession.score}`;
  $('sideAnswered').textContent = `${answeredCount}`;
  $('sideCategory').textContent = q.category;
  $('overallProgress').style.width = `${(curr / total) * 100}%`;

  // Question Card Meta
  $('cardQuestionNum').textContent = `QUESTION ${curr} OF ${total}`;
  $('sourcePage').textContent = q.page ? `Page ${q.page}` : '';
  $('domainTag').textContent = q.category;
  $('questionText').textContent = q.question;

  // Render options
  const optionsContainer = $('optionsList');
  optionsContainer.innerHTML = q.displayOptions
    .map(
      (opt) => `
      <button class="option-btn" data-letter="${opt.letter}">
        <span class="option-letter">${opt.letter}</span>
        <span class="option-text">${escapeHtml(opt.text)}</span>
      </button>
    `
    )
    .join('');

  optionsContainer.querySelectorAll('.option-btn').forEach((btn) => {
    btn.onclick = () => {
      handleOptionSelect(btn.dataset.letter);
    };
  });

  // Reset feedback
  const feedbackEl = $('feedbackBox');
  feedbackEl.className = 'feedback-box';
  feedbackEl.innerHTML = '';

  // Button state
  $('prevBtn').disabled = quizSession.currentIndex === 0;
  $('nextBtn').textContent =
    quizSession.currentIndex === total - 1 ? 'Finish Quiz' : 'Next / Skip';

  updateNavGrid();

  // If question was already answered, show saved answer
  const existingAns = quizSession.answers[quizSession.currentIndex];
  if (existingAns) {
    displayExistingAnswer(existingAns);
  } else {
    startQuestionTimer();
  }
}

function handleOptionSelect(selectedLetter) {
  if (quizSession.answers[quizSession.currentIndex]) return;
  clearAllTimers();

  const q = quizSession.questions[quizSession.currentIndex];
  const chosenOpt = q.displayOptions.find((o) => o.letter === selectedLetter);
  if (!chosenOpt) return;

  const isCorrect = !!chosenOpt.isCorrect;
  if (isCorrect) {
    quizSession.score++;
  }

  quizSession.answers[quizSession.currentIndex] = {
    selectedLetter,
    selectedText: chosenOpt.text,
    isCorrect,
    correctLetter: q.correctLetter,
    correctText: q.correctText,
    isTimeout: false,
  };

  saveSession();
  applyOptionStyles(selectedLetter, isCorrect, q.correctLetter);
  showFeedbackMessage(isCorrect, false, q.correctLetter, q.correctText);
  updateNavGrid();

  // Auto advance after 2 seconds
  autoAdvanceTimeout = setTimeout(() => {
    goToNextQuestion();
  }, 2000);
}

function handleTimeout() {
  clearAllTimers();
  const q = quizSession.questions[quizSession.currentIndex];
  if (quizSession.answers[quizSession.currentIndex]) return;

  quizSession.answers[quizSession.currentIndex] = {
    selectedLetter: null,
    selectedText: 'Time expired (No answer)',
    isCorrect: false,
    correctLetter: q.correctLetter,
    correctText: q.correctText,
    isTimeout: true,
  };

  saveSession();
  applyOptionStyles(null, false, q.correctLetter);
  showFeedbackMessage(false, true, q.correctLetter, q.correctText);
  updateNavGrid();

  autoAdvanceTimeout = setTimeout(() => {
    goToNextQuestion();
  }, 2500);
}

function applyOptionStyles(selectedLetter, isCorrect, correctLetter) {
  const buttons = document.querySelectorAll('.option-btn');
  buttons.forEach((btn) => {
    btn.classList.add('locked');
    const letter = btn.dataset.letter;

    if (letter === correctLetter) {
      btn.classList.add('is-correct');
    }
    if (letter === selectedLetter && !isCorrect) {
      btn.classList.add('is-incorrect');
    }
  });
}

function showFeedbackMessage(isCorrect, isTimeout, correctLetter, correctText) {
  const box = $('feedbackBox');
  box.className = 'feedback-box active';

  if (isTimeout) {
    box.classList.add('timeout');
    box.innerHTML = `⏱️ <strong>Time's up!</strong> The correct answer is <strong>${correctLetter}</strong>: ${escapeHtml(correctText)}`;
  } else if (isCorrect) {
    box.classList.add('correct');
    box.innerHTML = `✓ <strong>Correct!</strong> Option <strong>${correctLetter}</strong>: ${escapeHtml(correctText)}`;
  } else {
    box.classList.add('incorrect');
    box.innerHTML = `✗ <strong>Incorrect.</strong> The correct answer is <strong>${correctLetter}</strong>: ${escapeHtml(correctText)}`;
  }
}

function displayExistingAnswer(answer) {
  applyOptionStyles(answer.selectedLetter, answer.isCorrect, answer.correctLetter);
  showFeedbackMessage(answer.isCorrect, answer.isTimeout, answer.correctLetter, answer.correctText);
  $('timerDisplay').textContent = '--';
  $('timerBarFill').style.width = '0%';
  $('timerPill').classList.remove('warning');
}

// Timer Logic
function startQuestionTimer() {
  const duration = quizSession.timerDuration;
  if (!duration || duration <= 0) {
    $('timerDisplay').textContent = '∞';
    $('timerBarFill').style.width = '100%';
    $('timerPill').classList.remove('warning');
    return;
  }

  remainingTime = duration;
  $('timerDisplay').textContent = `${remainingTime}s`;
  $('timerBarFill').style.width = '100%';
  $('timerPill').classList.remove('warning');

  timerInterval = setInterval(() => {
    remainingTime--;
    $('timerDisplay').textContent = `${remainingTime}s`;
    const pct = Math.max(0, (remainingTime / duration) * 100);
    $('timerBarFill').style.width = `${pct}%`;

    if (remainingTime <= 5) {
      $('timerPill').classList.add('warning');
    }

    if (remainingTime <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      handleTimeout();
    }
  }, 1000);
}

function clearAllTimers() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (autoAdvanceTimeout) {
    clearTimeout(autoAdvanceTimeout);
    autoAdvanceTimeout = null;
  }
}

// Navigation
function goToNextQuestion() {
  clearAllTimers();
  if (quizSession.currentIndex < quizSession.questions.length - 1) {
    quizSession.currentIndex++;
    saveSession();
    renderCurrentQuestion();
  } else {
    finishQuiz();
  }
}

function goToPrevQuestion() {
  clearAllTimers();
  if (quizSession.currentIndex > 0) {
    quizSession.currentIndex--;
    saveSession();
    renderCurrentQuestion();
  }
}

function jumpToQuestion(index) {
  if (index >= 0 && index < quizSession.questions.length) {
    clearAllTimers();
    quizSession.currentIndex = index;
    saveSession();
    renderCurrentQuestion();
  }
}

function finishQuiz() {
  clearAllTimers();
  clearSession();

  $('quizView').classList.add('hidden');
  $('resultView').classList.remove('hidden');

  const total = quizSession.questions.length;
  const score = quizSession.score;
  const pct = Math.round((score / total) * 100);

  $('resultScore').textContent = `${pct}%`;
  $('resultDetails').textContent = `You scored ${score} out of ${total} (${quizSession.category})`;
  $('resultProgressFill').style.width = `${pct}%`;

  currentReviewFilter = 'all';
  renderReviewList();
}

function renderReviewList() {
  const container = $('reviewList');
  let items = quizSession.questions.map((q, i) => ({
    question: q,
    answer: quizSession.answers[i],
    index: i,
  }));

  if (currentReviewFilter === 'correct') {
    items = items.filter((item) => item.answer && item.answer.isCorrect);
  } else if (currentReviewFilter === 'incorrect') {
    items = items.filter((item) => !item.answer || !item.answer.isCorrect);
  }

  if (items.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); padding: 20px 0; text-align: center;">No questions match this filter.</div>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const q = item.question;
      const a = item.answer;
      let cardClass = 'review-card';
      let statusText = '';

      if (!a || a.isTimeout) {
        cardClass += ' timeout';
        statusText = `<span class="user-ans">Your Answer: <span class="wrong">${a ? 'Time expired' : 'Not answered'}</span></span>`;
      } else if (a.isCorrect) {
        cardClass += ' correct';
        statusText = `<span class="user-ans">Your Answer: <span class="right">${a.selectedLetter}. ${escapeHtml(a.selectedText)}</span></span>`;
      } else {
        cardClass += ' incorrect';
        statusText = `<span class="user-ans">Your Answer: <span class="wrong">${a.selectedLetter}. ${escapeHtml(a.selectedText)}</span></span>`;
      }

      return `
      <div class="${cardClass}">
        <div class="review-q-text"><strong>Q${item.index + 1}.</strong> ${escapeHtml(q.question)}</div>
        <div class="review-ans-row">
          ${statusText}
          <span class="correct-ans">Correct Answer: ${q.correctLetter}. ${escapeHtml(q.correctText)}</span>
        </div>
      </div>
    `;
    })
    .join('');
}

// Event Listeners
function setupEventListeners() {
  $('startBtn').onclick = () => startQuiz(false);
  $('continueBtn').onclick = () => startQuiz(true);
  $('nextBtn').onclick = goToNextQuestion;
  $('prevBtn').onclick = goToPrevQuestion;

  $('newQuizBtn').onclick = () => {
    clearSession();
    $('resultView').classList.add('hidden');
    $('startView').classList.remove('hidden');
    checkSavedProgress();
  };

  $('restartTopBtn').onclick = () => {
    const isQuizActive = !$('quizView').classList.contains('hidden');
    if (isQuizActive) {
      if (confirm('Are you sure you want to restart? Your current progress will be reset.')) {
        clearAllTimers();
        clearSession();
        $('quizView').classList.add('hidden');
        $('resultView').classList.add('hidden');
        $('startView').classList.remove('hidden');
        checkSavedProgress();
      }
    } else {
      $('resultView').classList.add('hidden');
      $('startView').classList.remove('hidden');
      checkSavedProgress();
    }
  };

  // Review Filters
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentReviewFilter = btn.dataset.filter;
      renderReviewList();
    };
  });

  // Domain select changes
  $('domainSelect').onchange = checkSavedProgress;

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    const isQuizActive = !$('quizView').classList.contains('hidden');
    if (!isQuizActive) return;

    const key = e.key.toUpperCase();
    if (KEYS.includes(key) && e.key.length === 1) {
      if (!quizSession.answers[quizSession.currentIndex]) {
        handleOptionSelect(key);
      }
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      goToNextQuestion();
    } else if (e.key === 'ArrowLeft') {
      goToPrevQuestion();
    }
  });
}

// Boot
window.addEventListener('DOMContentLoaded', initApp);
