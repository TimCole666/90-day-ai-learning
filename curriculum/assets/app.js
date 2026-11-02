// Client script for 90-Day Curriculum multi-language platform & Private Progress
(function() {
  'use strict';

  let i18n = {};
  let i18nQuiz = {};
  let i18nSub = {};
  let authI18n = {};
  let currentUser = null;
  const projectSubmissionLoadVersions = new Map();
  const projectSubmissionRequests = new Map();
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  function jsonHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    return headers;
  }

  try {
    const i18nEl = document.getElementById('i18n-progress-data');
    if (i18nEl) i18n = JSON.parse(i18nEl.textContent || '{}');
  } catch (e) {
    console.warn('Failed to parse i18n data', e);
  }

  try {
    const i18nQuizEl = document.getElementById('i18n-quiz-data');
    if (i18nQuizEl) i18nQuiz = JSON.parse(i18nQuizEl.textContent || '{}');
  } catch (e) {
    console.warn('Failed to parse quiz i18n data', e);
  }

  try {
    const subEl = document.getElementById('i18n-submission-data');
    if (subEl) i18nSub = JSON.parse(subEl.textContent || '{}');
  } catch (e) {
    console.warn('Failed to parse submission i18n data', e);
  }

  try {
    const authEl = document.getElementById('i18n-auth-data');
    if (authEl) authI18n = JSON.parse(authEl.textContent || '{}');
  } catch (e) {
    console.warn('Failed to parse auth i18n data', e);
  }

  try {
    const userEl = document.getElementById('current-user-data');
    if (userEl) currentUser = JSON.parse(userEl.textContent || 'null');
  } catch (e) {
    console.warn('Failed to parse current user data', e);
  }

  let currentTrack = 'claude-code';
  try {
    const trackEl = document.getElementById('current-track-data');
    if (trackEl) {
      const parsed = JSON.parse(trackEl.textContent || '{}');
      if (parsed.selected_track) currentTrack = parsed.selected_track;
    }
  } catch (e) {
    console.warn('Failed to parse current track data', e);
  }

  if (currentUser && currentUser.selected_track) {
    currentTrack = currentUser.selected_track;
  } else {
    try {
      const savedTrack = localStorage.getItem('user_track');
      if (savedTrack) currentTrack = savedTrack;
    } catch {}
  }

  function applyTrackSelection(trackId) {
    if (!trackId) return;
    currentTrack = trackId;

    // Update track cards UI
    document.querySelectorAll('.track-card').forEach(card => {
      const isSelected = card.dataset.track === trackId;
      card.classList.toggle('selected', isSelected);
      const indicator = card.querySelector('.track-selected-indicator');
      if (indicator) {
        indicator.style.display = isSelected ? '' : 'none';
      }
    });

    // Update tool-specific instruction panels
    document.querySelectorAll('.track-instructions-panel').forEach(panel => {
      const isSelected = panel.dataset.track === trackId;
      panel.classList.toggle('active', isSelected);
      panel.style.display = isSelected ? '' : 'none';
    });

    // Persist selected track
    if (currentUser) {
      fetch('/api/track', {
        method: 'POST',
        headers: { ...jsonHeaders(), 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ track: trackId })
      }).catch(err => console.error('Failed to persist track to server', err));
    } else {
      try {
        localStorage.setItem('user_track', trackId);
      } catch {}
      fetch('/api/track', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ track: trackId })
      }).catch(() => {});
    }
  }

  function initTrackSelection() {
    applyTrackSelection(currentTrack);

    document.querySelectorAll('.btn-select-track').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.track;
        if (trackId) applyTrackSelection(trackId);
      });
    });

    document.querySelectorAll('.track-card').forEach(card => {
      card.addEventListener('click', () => {
        const trackId = card.dataset.track;
        if (trackId) applyTrackSelection(trackId);
      });
    });
  }

  function updateLangSwitcherHrefs() {
    const hash = window.location.hash || '';
    const langLinks = document.querySelectorAll('.lang-switcher .lang-link');
    langLinks.forEach(link => {
      let baseHref = link.getAttribute('data-base-href');
      if (!baseHref) {
        baseHref = link.getAttribute('href').split('#')[0];
        link.setAttribute('data-base-href', baseHref);
      }
      link.setAttribute('href', baseHref + hash);
    });
  }

  // Activity progress management
  const activityVersions = new Map();
  const debounceTimers = new Map();

  async function saveProgress(activityId) {
    const container = document.querySelector(`.exercise-progress-controls[data-activity-id="${activityId}"]`);
    const input = document.querySelector(`.exercise-draft-input[data-activity-id="${activityId}"]`);
    const checkbox = document.querySelector(`.activity-completion-checkbox[data-activity-id="${activityId}"]`);
    const statusIndicator = container ? container.querySelector('.save-status-indicator') : null;

    const draftText = input ? input.value : '';
    const isCompleted = checkbox ? checkbox.checked : false;

    if (!currentUser) {
      // Guest mode - store locally in sessionStorage
      if (input) {
        sessionStorage.setItem('draft_' + activityId, draftText);
      }
      sessionStorage.setItem('complete_' + activityId, isCompleted ? '1' : '0');
      if (statusIndicator) {
        statusIndicator.textContent = i18n.offline || 'Local draft (guest)';
        statusIndicator.className = 'save-status-indicator status-offline';
      }
      return;
    }

    if (statusIndicator) {
      statusIndicator.textContent = i18n.saving || 'Saving...';
      statusIndicator.className = 'save-status-indicator status-saving';
    }

    const version = activityVersions.get(activityId) || 0;

    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: { ...jsonHeaders(), 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          activity_id: activityId,
          draft_text: draftText,
          completed: isCompleted,
          version: version
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.version) {
          activityVersions.set(activityId, data.version);
        }
        if (statusIndicator) {
          statusIndicator.textContent = i18n.saved || 'Saved';
          statusIndicator.className = 'save-status-indicator status-saved';
        }
        await loadQuizMastery(activityId);
      } else if (res.status === 409) {
        const errData = await res.json().catch(() => ({}));
        if (statusIndicator) {
          statusIndicator.textContent = i18n.save_error || 'Save conflict';
          statusIndicator.className = 'save-status-indicator status-error';
        }
        if (errData.current_version) {
          activityVersions.set(activityId, errData.current_version);
        }
      } else {
        if (statusIndicator) {
          statusIndicator.textContent = i18n.save_error || 'Save failed';
          statusIndicator.className = 'save-status-indicator status-error';
        }
      }
    } catch {
      // Network error or server unreachable
      if (statusIndicator) {
        statusIndicator.textContent = i18n.offline || 'Offline mode';
        statusIndicator.className = 'save-status-indicator status-offline';
      }
    }
  }

  function queueDebouncedSave(activityId) {
    if (debounceTimers.has(activityId)) {
      clearTimeout(debounceTimers.get(activityId));
    }
    const timer = setTimeout(() => {
      saveProgress(activityId);
      debounceTimers.delete(activityId);
    }, 800);
    debounceTimers.set(activityId, timer);
  }

  async function loadUserProgress() {
    if (!currentUser) {
      // Guest mode: restore from sessionStorage
      document.querySelectorAll('.exercise-draft-input').forEach(input => {
        const actId = input.dataset.activityId || 'default';
        const saved = sessionStorage.getItem('draft_' + actId);
        if (saved && !input.value) {
          input.value = saved;
        }
      });
      document.querySelectorAll('.activity-completion-checkbox').forEach(box => {
        const actId = box.dataset.activityId;
        if (actId && sessionStorage.getItem('complete_' + actId) === '1') {
          box.checked = true;
        }
      });
      return;
    }

    try {
      const res = await fetch('/api/progress');
      if (res.ok) {
        const data = await res.json();
        if (data.progress) {
          Object.entries(data.progress).forEach(([actId, record]) => {
            activityVersions.set(actId, record.version);
            const input = document.querySelector(`.exercise-draft-input[data-activity-id="${actId}"]`);
            if (input && record.draft_text !== undefined) {
              input.value = record.draft_text;
            }
            const box = document.querySelector(`.activity-completion-checkbox[data-activity-id="${actId}"]`);
            if (box) {
              box.checked = !!record.completed;
            }
            const container = document.querySelector(`.exercise-progress-controls[data-activity-id="${actId}"]`);
            const statusIndicator = container ? container.querySelector('.save-status-indicator') : null;
            if (statusIndicator && (record.draft_text || record.completed)) {
              statusIndicator.textContent = i18n.saved || 'Saved';
              statusIndicator.className = 'save-status-indicator status-saved';
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load user progress', e);
    }
  }

  function initProgressHandlers() {
    document.querySelectorAll('.btn-save-progress').forEach(btn => {
      btn.addEventListener('click', () => {
        const actId = btn.dataset.activityId;
        if (actId) saveProgress(actId);
      });
    });

    document.querySelectorAll('.activity-completion-checkbox').forEach(box => {
      box.addEventListener('change', () => {
        const actId = box.dataset.activityId;
        if (actId) saveProgress(actId);
      });
    });

    document.querySelectorAll('.exercise-draft-input').forEach(input => {
      const actId = input.dataset.activityId;
      input.addEventListener('input', () => {
        if (currentUser) {
          queueDebouncedSave(actId);
        } else {
          sessionStorage.setItem('draft_' + (actId || 'default'), input.value);
        }
      });
    });

    updateLangSwitcherHrefs();
    window.addEventListener('hashchange', updateLangSwitcherHrefs);

    // Save inputs before switching language
    document.querySelectorAll('.lang-switcher .lang-link').forEach(link => {
      link.addEventListener('click', () => {
        document.querySelectorAll('.exercise-draft-input').forEach(input => {
          const actId = input.dataset.activityId;
          if (currentUser) {
            saveProgress(actId);
          } else {
            sessionStorage.setItem('draft_' + (actId || 'default'), input.value);
          }
        });
        updateLangSwitcherHrefs();
      });
    });
  }

  async function loadQuizMastery(activityId) {
    const container = document.querySelector(`.quiz-container[data-activity-id="${activityId}"]`);
    if (!container) return;

    const panel = container.querySelector('.mastery-evidence-panel');
    if (!panel) return;

    const indepBadge = panel.querySelector('.badge-independent');
    const agentBadge = panel.querySelector('.badge-agent');
    const selfBadge = panel.querySelector('.badge-self-reported');
    const staleBadge = panel.querySelector('.badge-stale');
    const historyList = panel.querySelector('.attempts-history-list');

    if (!currentUser) {
      if (historyList) {
        historyList.replaceChildren();
        const emptyItem = document.createElement('li');
        emptyItem.className = 'no-attempts-item';
        emptyItem.textContent = i18nQuiz.no_attempts || 'No attempts recorded yet.';
        historyList.append(emptyItem);
      }
      return;
    }

    try {
      const res = await fetch(`/api/quiz/attempts?activityId=${encodeURIComponent(activityId)}`);
      if (res.ok) {
        const data = await res.json();
        const summary = data.summary;
        if (!summary) return;

        if (indepBadge) indepBadge.hidden = !summary.has_independent_pass;
        if (agentBadge) agentBadge.hidden = !summary.has_agent_assisted_pass;
        if (selfBadge) selfBadge.hidden = !summary.self_reported_completed;
        if (staleBadge) staleBadge.hidden = !(summary.stale_attempts_count > 0);

        if (historyList) {
          historyList.replaceChildren();
          const attempts = summary.attempts || [];
          if (attempts.length === 0) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'no-attempts-item';
            emptyItem.textContent = i18nQuiz.no_attempts || 'No attempts recorded yet.';
            historyList.append(emptyItem);
          } else {
            attempts.forEach(att => {
              const li = document.createElement('li');
              li.className = `attempt-record-item ${att.passed ? 'attempt-passed' : 'attempt-failed'} ${att.is_stale ? 'attempt-stale' : ''}`;
              const modeLabel = att.assistance_mode === 'independent'
                ? (i18nQuiz.mode_independent || 'Independent')
                : (i18nQuiz.mode_agent_assisted || 'Agent-Assisted');
              const passLabel = att.passed ? (i18nQuiz.passed_badge || 'Passed') : (i18nQuiz.failed_badge || 'Needs Review');
              const dateStr = new Date(att.created_at).toLocaleTimeString();


              const header = document.createElement('div');
              header.className = 'attempt-header';
              const mode = document.createElement('span');
              mode.className = 'attempt-mode';
              mode.textContent = modeLabel;
              const score = document.createElement('span');
              score.className = 'attempt-score';
              score.textContent = `${att.score}%`;
              const outcome = document.createElement('span');
              outcome.className = 'attempt-status';
              outcome.textContent = passLabel;
              header.append(mode, score, outcome);
              if (att.is_stale) {
                const stale = document.createElement('span');
                stale.className = 'tag-stale';
                stale.textContent = `[${i18nQuiz.stale_badge || 'Stale Revision'}]`;
                header.append(' ', stale);
              }
              const timestamp = document.createElement('span');
              timestamp.className = 'attempt-time';
              timestamp.textContent = `${dateStr} (rev: ${att.content_revision})`;
              li.append(header, timestamp);
              historyList.appendChild(li);
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load quiz mastery', e);
    }
  }

  async function submitQuiz(activityId) {
    const container = document.querySelector(`.quiz-container[data-activity-id="${activityId}"]`);
    if (!container) return;

    const statusEl = container.querySelector('.quiz-submit-status');
    const banner = container.querySelector('.quiz-results-banner');
    const retryBtn = container.querySelector('.btn-retry-quiz');

    const modeInput = container.querySelector(`input[name="assistance_mode_${activityId}"]:checked`);
    const assistanceMode = modeInput ? modeInput.value : 'independent';

    const answers = {};
    const questionCards = container.querySelectorAll('.quiz-question-card');
    questionCards.forEach(card => {
      const qId = card.dataset.questionId;
      const checked = card.querySelector(`input[name="quiz_${activityId}_${qId}"]:checked`);
      answers[qId] = checked ? checked.value : '';
    });

    if (!currentUser) {
      if (statusEl) {
        statusEl.textContent = i18nQuiz.guest_notice || 'Please sign in to record verified mastery evidence.';
        statusEl.className = 'quiz-submit-status status-error';
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = i18n.saving || 'Grading & saving...';
      statusEl.className = 'quiz-submit-status status-saving';
    }

    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { ...jsonHeaders(), 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          activity_id: activityId,
          content_revision: container.dataset.revision,
          assistance_mode: assistanceMode,
          answers: answers
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (statusEl) {
          statusEl.textContent = '';
          statusEl.className = 'quiz-submit-status';
        }

        if (banner) {
          const scoreEl = banner.querySelector('.quiz-score-badge');
          const feedbackEl = banner.querySelector('.quiz-feedback-text');
          if (scoreEl) scoreEl.textContent = `${data.score}%`;
          if (feedbackEl) {
            feedbackEl.textContent = data.passed
              ? (i18nQuiz.passed_badge || 'Passed')
              : (i18nQuiz.failed_badge || 'Needs Review');
            feedbackEl.className = `quiz-feedback-text ${data.passed ? 'passed' : 'failed'}`;
          }
          banner.hidden = false;
        }

        // Show per-question results & explanation
        if (Array.isArray(data.results)) {
          data.results.forEach(r => {
            const card = container.querySelector(`.quiz-question-card[data-question-id="${r.question_id}"]`);
            if (card) {
              const fbDiv = card.querySelector('.question-feedback');
              if (fbDiv) {
                fbDiv.hidden = false;
                fbDiv.className = `question-feedback ${r.correct ? 'feedback-correct' : 'feedback-incorrect'}`;
                const statusMsg = fbDiv.querySelector('.feedback-status-msg');
                if (statusMsg) {
                  statusMsg.replaceChildren();
                  const badge = document.createElement('span');
                  badge.className = 'feedback-badge';
                  badge.textContent = r.correct ? '✓ Correct' : '✗ Needs Review';
                  statusMsg.append(badge);
                  if (!r.correct) {
                    const expected = document.createElement('span');
                    expected.className = 'feedback-expected';
                    expected.textContent = `Expected: ${r.expected ? r.expected.toUpperCase() : ''}`;
                    statusMsg.append(' ', expected);
                  }
                }
                const expDiv = fbDiv.querySelector('.question-explanation');
                if (expDiv) expDiv.hidden = false;
              }
            }
          });
        }

        if (retryBtn) retryBtn.hidden = false;

        // Refresh mastery evidence
        await loadQuizMastery(activityId);
      } else {
        const errData = await res.json().catch(() => ({}));
        if (statusEl) {
          const revisionMessage = {
            en: 'This lesson has changed. Reload the page and revalidate your answers before submitting.',
            ja: '学習内容が更新されました。ページを再読み込みし、解答を確認してから再提出してください。',
            'zh-Hans': '课程内容已更新。请重新加载页面，核对答案后再提交。',
            'zh-Hant': '課程內容已更新。請重新載入頁面，核對答案後再提交。'
          };
          statusEl.textContent = ['stale_content_revision', 'content_revision_required'].includes(errData.code)
            ? (revisionMessage[document.documentElement.lang] || revisionMessage.en)
            : (errData.error || i18n.save_error || 'Submission failed');
          statusEl.className = 'quiz-submit-status status-error';
        }
      }
    } catch {
      if (statusEl) {
        statusEl.textContent = i18n.offline || 'Network error / Offline';
        statusEl.className = 'quiz-submit-status status-error';
      }
    }
  }

  function retryQuiz(activityId) {
    const container = document.querySelector(`.quiz-container[data-activity-id="${activityId}"]`);
    if (!container) return;

    const banner = container.querySelector('.quiz-results-banner');
    if (banner) {
      banner.hidden = true;
      const scoreEl = banner.querySelector('.quiz-score-badge');
      if (scoreEl) scoreEl.textContent = '';
      const feedbackEl = banner.querySelector('.quiz-feedback-text');
      if (feedbackEl) feedbackEl.textContent = '';
    }

    const retryBtn = container.querySelector('.btn-retry-quiz');
    if (retryBtn) retryBtn.hidden = true;

    container.querySelectorAll('.question-feedback').forEach(fb => {
      fb.hidden = true;
      const expDiv = fb.querySelector('.question-explanation');
      if (expDiv) expDiv.hidden = true;
    });

    const statusEl = container.querySelector('.quiz-submit-status');
    if (statusEl) statusEl.textContent = '';
  }

  function initQuizHandlers() {
    document.querySelectorAll('.btn-submit-quiz').forEach(btn => {
      btn.addEventListener('click', () => {
        const actId = btn.dataset.activityId;
        if (actId) submitQuiz(actId);
      });
    });

    document.querySelectorAll('.btn-retry-quiz').forEach(btn => {
      btn.addEventListener('click', () => {
        const actId = btn.dataset.activityId;
        if (actId) retryQuiz(actId);
      });
    });

    document.querySelectorAll('.btn-toggle-q-hint').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.question-hint-wrap');
        if (!wrap) return;
        const hintDiv = wrap.querySelector('.question-hint');
        if (!hintDiv) return;
        const isHidden = hintDiv.hidden || window.getComputedStyle(hintDiv).display === 'none';
        hintDiv.hidden = !isHidden;
        btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    });
  }

  // Interactive Hint & Answer Toggles
  function initToggles() {
    document.querySelectorAll('.btn-toggle-hint').forEach(btn => {
      btn.addEventListener('click', () => {
        const container = btn.closest('.exercise-container');
        if (!container) return;
        const hint = container.querySelector('.exercise-hint');
        if (!hint) return;
        const isHidden = hint.hidden || window.getComputedStyle(hint).display === 'none';
        hint.hidden = !isHidden;
        btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    });

    document.querySelectorAll('.btn-reveal-answer').forEach(btn => {
      btn.addEventListener('click', () => {
        const container = btn.closest('.exercise-container');
        if (!container) return;
        const answer = container.querySelector('.exercise-answer');
        if (!answer) return;
        const isHidden = answer.hidden || window.getComputedStyle(answer).display === 'none';
        answer.hidden = !isHidden;
        btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    });
  }

  function renderEvidencePanel(activityId, submission, summary) {
    const container = document.querySelector(`.project-submission-container[data-activity-id="${activityId}"]`);
    if (!container) return;

    const panel = container.querySelector('.project-evidence-panel');
    if (!panel) return;

    const emptyMsg = panel.querySelector('.evidence-empty-msg');
    const detailsDiv = panel.querySelector('.evidence-inspect-details');
    const badgesRow = panel.querySelector('.mastery-badges');
    const badgeVerified = panel.querySelector('.badge-evidence.badge-verified');
    const badgeReviewed = panel.querySelector('.badge-evidence.badge-reviewed');
    const badgeStale = panel.querySelector('.badge-evidence.badge-stale');

    // The self-reported badge is materialized only while self-reported
    // evidence is actually displayed: quiz mastery panels reuse the same
    // .badge-self-reported class, so a statically rendered copy would collide
    // with it inside the same activity card.
    let badgeSelf = panel.querySelector('.badge-evidence.badge-self-reported');

    if (!submission) {
      if (emptyMsg) emptyMsg.hidden = false;
      if (detailsDiv) detailsDiv.hidden = true;
      if (badgeSelf) { badgeSelf.remove(); badgeSelf = null; }
      if (badgeVerified) badgeVerified.hidden = true;
      if (badgeReviewed) badgeReviewed.hidden = true;
      if (badgeStale) badgeStale.hidden = true;
      return;
    }

    if (emptyMsg) emptyMsg.hidden = true;
    if (detailsDiv) detailsDiv.hidden = false;

    const containerRevision = container.getAttribute('data-revision') || '';
    const isStale = !!(containerRevision && submission.revision !== containerRevision) || !!(summary && summary.is_stale);

    if (badgeStale) badgeStale.hidden = !isStale;
    const showSelfReported = !isStale && submission.evidence_status === 'self_reported';
    if (showSelfReported) {
      if (!badgeSelf && badgesRow) {
        badgeSelf = document.createElement('span');
        badgeSelf.className = 'badge-evidence badge-self-reported';
        badgeSelf.textContent = i18nSub.status_self_reported || 'Self-Reported Evidence';
        badgesRow.insertBefore(badgeSelf, badgesRow.firstChild);
      }
      if (badgeSelf) badgeSelf.hidden = false;
    } else if (badgeSelf) {
      badgeSelf.remove();
      badgeSelf = null;
    }
    if (badgeVerified) badgeVerified.hidden = isStale || submission.evidence_status !== 'verified_check';
    if (badgeReviewed) badgeReviewed.hidden = isStale || submission.evidence_status !== 'independently_reviewed';

    // Populate Repo row
    const repoRow = detailsDiv.querySelector('.evidence-repo-row');
    const repoLink = detailsDiv.querySelector('a.evidence-repo-link');
    if (repoRow && repoLink) {
      if (submission.repo_url) {
        repoLink.setAttribute('href', submission.repo_url);
        repoLink.textContent = submission.repo_url;
        repoRow.hidden = false;
      } else {
        repoRow.hidden = true;
      }
    }

    // Populate Report row
    const reportRow = detailsDiv.querySelector('.evidence-report-row');
    const reportLink = detailsDiv.querySelector('a.evidence-report-link');
    if (reportRow && reportLink) {
      if (submission.report_url) {
        reportLink.setAttribute('href', submission.report_url);
        reportLink.textContent = submission.report_url;
        reportRow.hidden = false;
      } else {
        reportRow.hidden = true;
      }
    }

    // Populate Notes row
    const notesRow = detailsDiv.querySelector('.evidence-notes-row');
    const notesText = detailsDiv.querySelector('.evidence-notes-text');
    if (notesRow && notesText) {
      if (submission.text_notes) {
        notesText.textContent = submission.text_notes;
        notesRow.hidden = false;
      } else {
        notesRow.hidden = true;
      }
    }

    // Populate Badges row (mode & track)
    const modeBadge = detailsDiv.querySelector('.evidence-mode-badge');
    if (modeBadge) {
      const modeLabel = submission.assistance_mode === 'independent'
        ? (i18nSub.mode_independent || 'Independent Project')
        : (i18nSub.mode_agent_assisted || 'Agent-Assisted Project');
      modeBadge.textContent = modeLabel;
      modeBadge.className = `badge evidence-mode-badge badge-mode-${submission.assistance_mode}`;
    }

    const trackBadge = detailsDiv.querySelector('.evidence-track-badge');
    if (trackBadge) {
      if (submission.selected_track) {
        const trackDict = i18nSub.tracks || {};
        trackBadge.textContent = trackDict[submission.selected_track.replace(/-/g, '_')] || submission.selected_track;
        trackBadge.hidden = false;
      } else {
        trackBadge.hidden = true;
      }
    }
  }

  async function loadProjectSubmission(activityId) {
    const container = document.querySelector(`.project-submission-container[data-activity-id="${activityId}"]`);
    if (!container) return;

    const loadVersion = (projectSubmissionLoadVersions.get(activityId) || 0) + 1;
    projectSubmissionLoadVersions.set(activityId, loadVersion);

    if (!currentUser) {
      renderEvidencePanel(activityId, null, null);
      return;
    }

    try {
      const res = await fetch(`/api/project/submission?activityId=${encodeURIComponent(activityId)}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!res.ok) return;

      const data = await res.json();
      if (projectSubmissionLoadVersions.get(activityId) !== loadVersion) return;
      if (data.submission) {
        const repoInput = container.querySelector('.project-repo-input');
        const reportInput = container.querySelector('.project-report-input');
        const notesInput = container.querySelector('.project-notes-input');
        const trackSelect = container.querySelector('.project-track-select');

        if (repoInput) repoInput.value = data.submission.repo_url || '';
        if (reportInput) reportInput.value = data.submission.report_url || '';
        if (notesInput) {
          notesInput.value = data.submission.text_notes || '';
          updateBytesCounter(container);
        }
        if (trackSelect) trackSelect.value = data.submission.selected_track || '';

        const modeRadio = container.querySelector(`input[name="project_mode_${activityId}"][value="${data.submission.assistance_mode}"]`);
        if (modeRadio) modeRadio.checked = true;

        renderEvidencePanel(activityId, data.submission, data.summary);
      } else {
        renderEvidencePanel(activityId, null, null);
      }
    } catch (e) {
      console.warn('Failed to load project submission', e);
    }
  }

  function updateBytesCounter(container) {
    const notesInput = container.querySelector('.project-notes-input');
    const bytesSpan = container.querySelector('.bytes-count');
    if (!notesInput || !bytesSpan) return;
    const str = notesInput.value || '';
    const bytes = new TextEncoder().encode(str).length;
    bytesSpan.textContent = String(bytes);
    if (bytes > 4096) {
      bytesSpan.classList.add('bytes-over-limit');
    } else {
      bytesSpan.classList.remove('bytes-over-limit');
    }
  }

  async function submitProject(activityId) {
    const container = document.querySelector(`.project-submission-container[data-activity-id="${activityId}"]`);
    if (!container) return;

    // User edits take precedence over any page-load refresh still in flight.
    projectSubmissionLoadVersions.set(
      activityId,
      (projectSubmissionLoadVersions.get(activityId) || 0) + 1
    );

    const statusEl = container.querySelector('.project-submit-status');
    const repoInput = container.querySelector('.project-repo-input');
    const reportInput = container.querySelector('.project-report-input');
    const notesInput = container.querySelector('.project-notes-input');
    const trackSelect = container.querySelector('.project-track-select');
    const modeRadio = container.querySelector(`input[name="project_mode_${activityId}"]:checked`);

    const repoUrl = repoInput ? repoInput.value.trim() : '';
    const reportUrl = reportInput ? reportInput.value.trim() : '';
    const textNotes = notesInput ? notesInput.value : '';
    const selectedTrack = trackSelect ? trackSelect.value : '';
    const assistanceMode = modeRadio ? modeRadio.value : 'independent';
    const revision = container.getAttribute('data-revision') || '1.0.0';

    // Validation
    if (!repoUrl && !reportUrl && !textNotes.trim()) {
      if (statusEl) {
        statusEl.textContent = i18nSub.val_empty || 'Please provide at least a repository link, report link, or evidence notes.';
        statusEl.className = 'project-submit-status status-error';
      }
      return;
    }

    if (repoUrl) {
      let valid = false;
      try {
        const u = new URL(repoUrl);
        if (u.protocol === 'http:' || u.protocol === 'https:') valid = true;
      } catch {}
      if (!valid) {
        if (statusEl) {
          statusEl.textContent = i18nSub.val_invalid_url || 'Invalid URL: Repository link must use http or https.';
          statusEl.className = 'project-submit-status status-error';
        }
        return;
      }
    }

    if (reportUrl) {
      let valid = false;
      try {
        const u = new URL(reportUrl);
        if (u.protocol === 'http:' || u.protocol === 'https:') valid = true;
      } catch {}
      if (!valid) {
        if (statusEl) {
          statusEl.textContent = i18nSub.val_invalid_url || 'Invalid URL: Report link must use http or https.';
          statusEl.className = 'project-submit-status status-error';
        }
        return;
      }
    }

    const bytes = new TextEncoder().encode(textNotes).length;
    if (bytes > 4096) {
      if (statusEl) {
        statusEl.textContent = i18nSub.val_notes_too_long || 'Evidence notes exceed the maximum limit of 4096 bytes.';
        statusEl.className = 'project-submit-status status-error';
      }
      return;
    }

    if (!currentUser) {
      if (statusEl) {
        statusEl.textContent = 'Sign-in required to submit project evidence.';
        statusEl.className = 'project-submit-status status-error';
      }
      return;
    }

    if (projectSubmissionRequests.has(activityId)) return;

    const submitButton = container.querySelector('.btn-submit-project');
    if (submitButton) submitButton.disabled = true;
    if (statusEl) {
      statusEl.textContent = i18nSub.status_saving || 'Saving submission...';
      statusEl.className = 'project-submit-status status-saving';
    }

    projectSubmissionRequests.set(activityId, true);
    try {
      const res = await fetch('/api/project/submit', {
        method: 'POST',
        headers: { ...jsonHeaders(), 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          project_id: activityId,
          revision,
          assistance_mode: assistanceMode,
          selected_track: selectedTrack || null,
          repo_url: repoUrl,
          report_url: reportUrl,
          text_notes: textNotes
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (statusEl) {
          statusEl.textContent = i18nSub.status_saved || 'Submission saved successfully.';
          statusEl.className = 'project-submit-status status-success';
        }
        renderEvidencePanel(activityId, data.submission, { is_stale: false });
      } else {
        const errData = await res.json().catch(() => ({}));
        if (statusEl) {
          statusEl.textContent = errData.error || i18nSub.status_error || 'Submission failed';
          statusEl.className = 'project-submit-status status-error';
        }
      }
    } catch {
      if (statusEl) {
        statusEl.textContent = i18nSub.status_error || 'Network error / submission failed';
        statusEl.className = 'project-submit-status status-error';
      }
    } finally {
      projectSubmissionRequests.delete(activityId);
      if (submitButton) submitButton.disabled = false;
    }
  }

  function initProjectSubmissionHandlers() {
    document.querySelectorAll('.btn-submit-project').forEach(btn => {
      btn.addEventListener('click', () => {
        const actId = btn.dataset.activityId;
        if (actId) submitProject(actId);
      });
    });

    document.querySelectorAll('.project-submission-container').forEach(container => {
      const notesInput = container.querySelector('.project-notes-input');
      if (notesInput) {
        notesInput.addEventListener('input', () => updateBytesCounter(container));
      }
      const activityId = container.dataset.activityId;
      if (activityId) {
        const invalidateLoad = () => {
          projectSubmissionLoadVersions.set(
            activityId,
            (projectSubmissionLoadVersions.get(activityId) || 0) + 1
          );
        };
        container.addEventListener('input', invalidateLoad);
        container.addEventListener('change', invalidateLoad);
      }
    });
  }

  window.refreshProjectEvidence = loadProjectSubmission;

  async function submitDiagnostics() {
    const container = document.querySelector('.diagnostics-container');
    const button = document.querySelector('.btn-submit-diagnostic');
    const status = document.querySelector('.diag-status-message');
    if (!container || !button) return;

    if (!currentUser) {
      if (status) {
        status.textContent = 'Please sign in before saving a diagnostic attempt.';
        status.className = 'diag-status-message status-error';
        status.hidden = false;
      }
      return;
    }

    const answers = {};
    container.querySelectorAll('.diagnostic-question-card').forEach(card => {
      const questionId = card.dataset.questionId;
      const selected = card.querySelector('input[type="radio"]:checked');
      if (questionId) answers[questionId] = selected ? selected.value : '';
    });

    const uncertainQuestions = Array.from(container.querySelectorAll('.chk-uncertain:checked'))
      .map(input => input.value);
    const claimedSkips = Array.from(container.querySelectorAll('.skip-chk-label input:checked'))
      .map(input => input.value);
    const modeInput = container.querySelector('input[name="diag_assistance_mode"]:checked');
    const lang = container.dataset.lang || document.documentElement.lang || 'en';

    button.disabled = true;
    if (status) {
      status.textContent = 'Saving diagnostic and generating review plan...';
      status.className = 'diag-status-message status-saving';
      status.hidden = false;
    }

    try {
      const response = await fetch('/api/diagnostics/submit', {
        method: 'POST',
        headers: { ...jsonHeaders(), 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          answers,
          uncertain_questions: uncertainQuestions,
          claimed_skips: claimedSkips,
          assistance_mode: modeInput ? modeInput.value : 'independent',
          lang
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Diagnostic save failed. Your attempt was not saved.');
      }

      // The server is the source of truth for the rendered plan. Reloading also
      // makes the durable-save boundary explicit instead of presenting a draft
      // as persisted before the response has completed.
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      if (status) {
        status.textContent = error.message || 'Diagnostic save failed. Please try again.';
        status.className = 'diag-status-message status-error';
        status.hidden = false;
      }
    }
  }

  function initDiagnosticsHandlers() {
    const submitButton = document.querySelector('.btn-submit-diagnostic');
    if (submitButton) submitButton.addEventListener('click', submitDiagnostics);

    document.querySelectorAll('.btn-retry-diagnostic').forEach(button => {
      button.addEventListener('click', () => {
        const section = document.querySelector('.review-plan-section');
        if (section) {
          section.hidden = true;
          section.replaceChildren();
        }
        document.querySelectorAll('.diagnostic-question-card input[type="radio"], .diagnostic-question-card input[type="checkbox"], .skip-chk-label input').forEach(input => {
          input.checked = false;
        });
        const independent = document.querySelector('input[name="diag_assistance_mode"][value="independent"]');
        if (independent) independent.checked = true;
        const status = document.querySelector('.diag-status-message');
        if (status) status.hidden = true;
      });
    });
  }

  function handleAuthAlerts() {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    const linked = params.get('linked');
    const alertBox = document.getElementById('auth-alert-box');
    if (!alertBox) return;

    if (authError) {
      const errDict = authI18n.auth_errors || {};
      let msg = errDict[authError] || errDict.provider_error || 'An authentication error occurred. Please try again.';
      alertBox.textContent = msg;
      alertBox.className = 'auth-alert-box auth-alert-error';
      alertBox.hidden = false;
    } else if (linked) {
      const providerLabel = linked === 'github' ? 'GitHub' : (linked === 'google' ? 'Google' : linked);
      alertBox.textContent = `Successfully linked ${providerLabel} account.`;
      alertBox.className = 'auth-alert-box auth-alert-success';
      alertBox.hidden = false;
    }

    if (authError || linked) {
      params.delete('auth_error');
      params.delete('linked');
      const newQuery = params.toString() ? '?' + params.toString() : '';
      const newUrl = window.location.pathname + newQuery + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }

  // Content correction reports (spec US59). The form only renders for
  // signed-in learners; the server owns validation and the stored record.
  function initCorrectionForm() {
    const form = document.getElementById('correction-form');
    if (!form) return;
    const status = document.getElementById('correction-status');
    const textarea = document.getElementById('correction-description');
    const select = document.getElementById('correction-activity');
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button) button.disabled = true;
      if (status) status.textContent = '';
      try {
        const response = await fetch('/api/corrections', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({
            day_id: form.dataset.dayId,
            lang: form.dataset.lang,
            activity_id: (select && select.value) || null,
            edition_revision: form.dataset.editionRevision,
            description: textarea ? textarea.value : ''
          })
        });
        if (!response.ok) throw new Error(String(response.status));
        if (status) status.textContent = form.dataset.sent || '';
        if (textarea) textarea.value = '';
      } catch (error) {
        if (status) status.textContent = form.dataset.failed || '';
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  // Marks the activity currently being read in the day page's "On this page"
  // rail. Purely presentational; pages without the rail are unaffected.
  function initTocSpy() {
    const links = Array.from(document.querySelectorAll('.day-toc .toc-link'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(links.map(link => [decodeURIComponent(link.hash.slice(1)), link]));
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      });
      const current = Array.from(byId.keys()).find(id => visible.has(id));
      if (!current) return;
      links.forEach(link => link.removeAttribute('aria-current'));
      byId.get(current).setAttribute('aria-current', 'true');
    }, { rootMargin: '-20% 0px -60% 0px' });
    byId.forEach((link, id) => {
      const target = document.getElementById(id);
      if (target) observer.observe(target);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    handleAuthAlerts();
    initTocSpy();
    initProgressHandlers();
    initTrackSelection();
    initToggles();
    initQuizHandlers();
    initProjectSubmissionHandlers();
    initDiagnosticsHandlers();
    initCorrectionForm();
    await loadUserProgress();
    const quizContainers = document.querySelectorAll('.quiz-container');
    for (const c of quizContainers) {
      if (c.dataset.activityId) {
        await loadQuizMastery(c.dataset.activityId);
      }
    }
    const projectContainers = document.querySelectorAll('.project-submission-container');
    for (const c of projectContainers) {
      if (c.dataset.activityId) {
        await loadProjectSubmission(c.dataset.activityId);
      }
    }
  });
})();
