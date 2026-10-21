
(() => {
  'use strict';

  // =====================================================
  // 1. CONFIGURATION AND SUPABASE
  // =====================================================

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const CONFIG = window.LEARNHUB_CONFIG || {
    SUPABASE_URL: 'https://wkcvpfkthnlqzvndmrhq.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_M333boZjNvM3wk-DRR1yKw_Hr8I1-DC',
    AI_ENDPOINT: '/api/study-assistant'
  };

  const hasSupabase = Boolean(
    CONFIG.SUPABASE_URL &&
    CONFIG.SUPABASE_ANON_KEY &&
    window.supabase?.createClient
  );

  const db = hasSupabase
    ? window.supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      )
    : null;

  // =====================================================
  // 2. APPLICATION STATE
  // =====================================================

  let user = null;
  let profile = null;
  let authMode = 'signin';
  let currentPage = 'dashboard';
  let tasks = [];
  let assignments = [];
  let quizIndex = 0;
  let quizScore = 0;
  let quizChoice = null;
  let quizChecked = false;
  let quizAnswers = [];
  let chatHistory = [];
  let authBusy = false;

  const storage = {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch (error) {
        console.warn('Local storage unavailable:', error);
      }
    }
  };

  const bestScoreKey = 'learnhub-best-score';
  let bestScore = Number(storage.get(bestScoreKey, '0')) || 0;

  const localKey = () => `learnhub-tasks-${user?.id || 'guest'}`;

  // =====================================================
  // 3. SUBJECTS AND QUIZ QUESTIONS
  // =====================================================

  const subjects = [
    {
      name: 'Mathematics',
      key: 'math',
      icon: '∑',
      desc: 'Explore numbers, patterns, equations and logic.',
      topics: 'Algebra · Geometry · Number',
      color: 'math'
    },
    {
      name: 'English',
      key: 'english',
      icon: 'Aa',
      desc: 'Build confidence in reading, writing and grammar.',
      topics: 'Reading · Writing · Grammar',
      color: 'english'
    },
    {
      name: 'Science',
      key: 'science',
      icon: '⚗',
      desc: 'Discover how the world works.',
      topics: 'Biology · Chemistry · Physics',
      color: 'science'
    },
    {
      name: 'ICT',
      key: 'ict',
      icon: '⌘',
      desc: 'Develop digital and computing skills.',
      topics: 'Computing · Coding · Digital skills',
      color: 'ict'
    }
  ];

  const questions = [
    {
      question: 'Which number is a prime number?',
      options: ['21', '29', '35', '39'],
      answer: 1,
      explain: '29 has exactly two positive factors: 1 and 29.'
    },
    {
      question: 'Which part of a plant mainly absorbs sunlight?',
      options: ['Roots', 'Petals', 'Leaves', 'Seeds'],
      answer: 2,
      explain: 'Leaves contain chlorophyll, which absorbs light for photosynthesis.'
    },
    {
      question: 'Which sentence uses the apostrophe correctly?',
      options: [
        'The students book is here.',
        'The student’s book is here.',
        'The students’s book is here.',
        'The student book’s is here.'
      ],
      answer: 1,
      explain: 'The apostrophe in “student’s” indicates that the book belongs to one student.'
    },
    {
      question: 'What does CPU stand for?',
      options: [
        'Central Processing Unit',
        'Computer Power Utility',
        'Core Program Upload',
        'Central Print Unit'
      ],
      answer: 0,
      explain: 'CPU stands for Central Processing Unit.'
    },
    {
      question: 'What is 3/4 expressed as a percentage?',
      options: ['25%', '50%', '70%', '75%'],
      answer: 3,
      explain: '3 ÷ 4 = 0.75, which is 75%.'
    }
  ];

  // =====================================================
  // 4. HELPERS AND NOTIFICATIONS
  // =====================================================

  const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);

  const dateText = value => {
    if (!value) return 'No deadline';

    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== new Date().getFullYear()
        ? 'numeric'
        : undefined
    });
  };

  function toast(message, error = false) {
    const region = $('#toast-region');

    if (!region) {
      (error ? console.error : console.log)(message);
      return;
    }

    const item = document.createElement('div');
    item.className = `toast${error ? ' toast-error' : ''}`;
    item.textContent = message;
    region.appendChild(item);

    setTimeout(() => item.remove(), 3600);
  }

  function showModal(title, message) {
    const modal = $('#app-modal');
    if (!modal) {
      window.alert(`${title}\n\n${message}`);
      return;
    }

    const heading = $('#modal-title');
    const body = $('#modal-message');

    if (heading) heading.textContent = title;
    if (body) body.textContent = message;

    modal.hidden = false;
    modal.classList.add('open');
  }

  function closeModal() {
    const modal = $('#app-modal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.hidden = true;
  }

  function setTheme(theme) {
    const dark = theme === 'dark';

    document.body.classList.toggle('dark', dark);
    storage.set('learnhub-theme', dark ? 'dark' : 'light');

    const button = $('#theme-toggle');
    if (button) {
      button.textContent = dark ? '☀' : '☾';
      button.setAttribute(
        'aria-label',
        dark ? 'Switch to light theme' : 'Switch to dark theme'
      );
    }
  }

  // =====================================================
  // 5. AUTHENTICATION UI
  // =====================================================

  function showAuth(mode = 'signin', message = '') {
    authMode = mode === 'signup' ? 'signup' : 'signin';

    const authScreen = $('#auth-screen');
    const appShell = $('#app-shell');

    if (authScreen) authScreen.hidden = false;
    if (appShell) appShell.hidden = true;

    const signup = authMode === 'signup';

    const title = $('#auth-title');
    const subtitle = $('#auth-subtitle');
    const submit = $('#auth-submit');
    const switchCopy = $('#auth-switch-copy');
    const switchButton = $('#auth-switch');
    const nameField = $('#auth-name-field');
    const roleField = $('#auth-role-field');
    const nameInput = $('#auth-name');
    const password = $('#auth-password');
    const messageBox = $('#auth-message');

    if (title) title.textContent = signup ? 'Create your account' : 'Welcome back';
    if (subtitle) {
      subtitle.textContent = signup
        ? 'Join LearnHub and start learning.'
        : 'Sign in to continue learning.';
    }

    if (submit) {
      submit.textContent = signup ? 'Create account' : 'Sign in';
      submit.disabled = false;
    }

    if (switchCopy) {
      switchCopy.textContent = signup
        ? 'Already have an account?'
        : 'Don’t have an account?';
    }

    if (switchButton) {
      switchButton.textContent = signup ? 'Sign in' : 'Create account';
    }

    if (nameField) nameField.hidden = !signup;
    if (roleField) roleField.hidden = !signup;
    if (nameInput) nameInput.required = signup;

    if (password) {
      password.autocomplete = signup ? 'new-password' : 'current-password';
    }

    if (messageBox) {
      messageBox.textContent = message;
      messageBox.hidden = !message;
    }
  }

  function authMessage(message) {
    const box = $('#auth-message');

    if (box) {
      box.textContent = message;
      box.hidden = false;
    } else {
      toast(message, true);
    }
  }

  function explainAuthError(error) {
    const message = String(error?.message || error || '');

    if (/invalid login credentials/i.test(message)) {
      return 'Incorrect email or password. Check your details or create an account first.';
    }

    if (/email not confirmed/i.test(message)) {
      return 'Please confirm your email using the link Supabase sent you.';
    }

    if (/user already registered/i.test(message)) {
      return 'This email already has an account. Switch to Sign in.';
    }

    if (/password should be at least/i.test(message)) {
      return 'Your password does not meet the minimum length requirement.';
    }

    if (/rate limit/i.test(message)) {
      return 'Too many attempts. Wait a little while and try again.';
    }

    if (/failed to fetch|networkerror|fetch failed/i.test(message)) {
      return 'Could not reach Supabase. Check your internet connection and project URL.';
    }

    return message || 'Authentication failed. Please try again.';
  }

  // =====================================================
  // 6. PROFILE AND SESSION
  // =====================================================

  async function getProfile() {
    if (!db || !user) return null;

    try {
      const { data, error } = await db
        .from('profiles')
        .select('id, display_name, role, teacher_approved')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('Profile lookup failed:', error.message);
        return null;
      }

      return data;
    } catch (error) {
      console.warn('Profile lookup failed:', error);
      return null;
    }
  }

  function userDisplayName() {
    return (
      profile?.display_name ||
      user?.user_metadata?.full_name ||
      user?.email?.split('@')[0] ||
      'Student'
    );
  }

  function showApp() {
    const authScreen = $('#auth-screen');
    const appShell = $('#app-shell');

    if (authScreen) authScreen.hidden = true;
    if (appShell) appShell.hidden = false;

    const name = userDisplayName();
    const initial = name.trim().charAt(0).toUpperCase() || 'S';
    const role = profile?.role || user?.user_metadata?.requested_role || 'student';

    [
      '#sidebar-user-name',
      '#top-user-name',
      '#welcome-name'
    ].forEach(selector => {
      const element = $(selector);
      if (element) element.textContent = name;
    });

    ['#sidebar-avatar', '#top-user-avatar'].forEach(selector => {
      const element = $(selector);
      if (element) element.textContent = initial;
    });

    const roleLabel = $('#sidebar-user-role');
    if (roleLabel) roleLabel.textContent = role;

    const welcome = $('#welcome-title');
    if (welcome) welcome.textContent = `Welcome back, ${name}!`;

    const today = $('#today-label');
    if (today) {
      today.textContent = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
    }

    const year = $('#footer-year');
    if (year) year.textContent = new Date().getFullYear();

    const teacherLink = $('[data-page="teacher"]');
    if (teacherLink) {
      teacherLink.hidden = !['teacher', 'admin'].includes(role);
    }
  }

  async function startSession(sessionUser) {
    if (!sessionUser) {
      showAuth('signin');
      return;
    }

    user = sessionUser;
    profile = await getProfile();

    showApp();

    await Promise.allSettled([
      loadTasks(),
      loadAssignments()
    ]);

    renderAll();
    navigate('dashboard');
  }

  // =====================================================
  // 7. SIGN IN, SIGN UP AND PASSWORD RESET
  // =====================================================

  async function handleAuth(event) {
    event?.preventDefault();

    if (authBusy) return;

    if (!db) {
      authMessage(
        'Supabase is unavailable. Check the script order and config.js, then reload the page.'
      );
      return;
    }

    const email = $('#auth-email')?.value.trim() || '';
    const password = $('#auth-password')?.value || '';
    const name = $('#auth-name')?.value.trim() || '';
    const requestedRole = $('#auth-role')?.value || 'student';
    const submit = $('#auth-submit');

    if (!email || !password) {
      authMessage('Enter your email address and password.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      authMessage('Enter a valid email address.');
      return;
    }

    if (authMode === 'signup' && password.length < 6) {
      authMessage('Use a password with at least 6 characters.');
      return;
    }

    if (authMode === 'signup' && !name) {
      authMessage('Enter your name.');
      return;
    }

    authBusy = true;

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Please wait…';
    }

    try {
      if (authMode === 'signup') {
        const { data, error } = await db.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              requested_role: requestedRole === 'teacher' ? 'teacher' : 'student'
            }
          }
        });

        if (error) throw error;

        if (data.session && data.user) {
          await startSession(data.user);
          toast('Your account has been created.');
        } else {
          showAuth(
            'signin',
            'Account created. Check your email for a confirmation link if email confirmation is enabled.'
          );
        }
      } else {
        const { data, error } = await db.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        if (!data.session || !data.user) {
          throw new Error('Login succeeded without an active session. Please try again.');
        }

        await startSession(data.user);
        toast('You are signed in.');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      authMessage(explainAuthError(error));
    } finally {
      authBusy = false;

      if (submit) {
        submit.disabled = false;
        submit.textContent = authMode === 'signup'
          ? 'Create account'
          : 'Sign in';
      }
    }
  }

  async function resetPassword() {
    if (!db) {
      authMessage('Supabase is not available. Check your configuration.');
      return;
    }

    const email = $('#auth-email')?.value.trim();

    if (!email) {
      authMessage('Enter your email address first, then click Forgot password.');
      $('#auth-email')?.focus();
      return;
    }

    try {
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href.split('#')[0]
      });

      if (error) throw error;

      toast('If the account exists, a password reset email will be sent.');
    } catch (error) {
      console.error('Password reset error:', error);
      authMessage(explainAuthError(error));
    }
  }

  async function signOut() {
    try {
      if (db) {
        const { error } = await db.auth.signOut();
        if (error) throw error;
      }
    } catch (error) {
      console.error('Sign-out error:', error);
      toast(explainAuthError(error), true);
    }

    user = null;
    profile = null;
    tasks = [];
    assignments = [];
    chatHistory = [];

    closeSidebar();
    showAuth('signin');
    toast('You have signed out.');
  }

  // =====================================================
  // 8. NAVIGATION
  // =====================================================

  function navigate(page) {
    const allowedPages = [
      'dashboard', 'subjects', 'tasks', 'quiz', 'assistant', 'teacher'
    ];

    if (!allowedPages.includes(page)) page = 'dashboard';

    if (
      page === 'teacher' &&
      !['teacher', 'admin'].includes(profile?.role)
    ) {
      toast('The teacher area is only available to approved teachers.', true);
      page = 'dashboard';
    }

    currentPage = page;

    $$('.page').forEach(element => {
      element.classList.toggle('active', element.id === `${page}-page`);
    });

    $$('.nav-item').forEach(element => {
      element.classList.toggle('active', element.dataset.page === page);
    });

    const labels = {
      dashboard: 'Dashboard',
      subjects: 'Subjects',
      tasks: 'My Tasks',
      quiz: 'Quick Quiz',
      assistant: 'Study Assistant',
      teacher: 'Teacher Area'
    };

    const breadcrumb = $('#breadcrumb-current');
    if (breadcrumb) breadcrumb.textContent = labels[page] || 'Dashboard';

    closeSidebar();

    if (page === 'quiz') renderQuiz();
    if (page === 'teacher') renderTeacher();

    if (page === 'assistant') {
      setTimeout(() => $('#chat-input')?.focus(), 100);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('open');
    $('#sidebar-overlay')?.classList.add('visible');
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('open');
    $('#sidebar-overlay')?.classList.remove('visible');
  }

  // =====================================================
  // 9. SUBJECTS
  // =====================================================

  function subjectHTML(subject) {
    return `
      <article class="subject-card ${escapeHTML(subject.color)}"
               data-subject="${escapeHTML(subject.key)}">
        <div class="subject-icon">${escapeHTML(subject.icon)}</div>
        <h3>${escapeHTML(subject.name)}</h3>
        <p>${escapeHTML(subject.desc)}</p>
        <span>${escapeHTML(subject.topics)}</span>
      </article>
    `;
  }

  function renderSubjects() {
    const grid = $('#subjects-grid');
    const dashboardGrid = $('#dashboard-subjects');

    if (grid) grid.innerHTML = subjects.map(subjectHTML).join('');
    if (dashboardGrid) {
      dashboardGrid.innerHTML = subjects.slice(0, 4).map(subjectHTML).join('');
    }

    const count = $('#stat-subjects');
    if (count) count.textContent = subjects.length;

    ['#task-subject', '#assignment-subject'].forEach(selector => {
      const select = $(selector);
      if (!select) return;

      const previous = select.value;

      select.innerHTML =
        '<option value="">Choose a subject</option>' +
        subjects.map(subject =>
          `<option value="${escapeHTML(subject.name)}">${escapeHTML(subject.name)}</option>`
        ).join('');

      if (previous) select.value = previous;
    });
  }

  // =====================================================
  // 10. TASK STORAGE
  // =====================================================

  function localLoad() {
    try {
      const value = JSON.parse(storage.get(localKey(), '[]'));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  async function loadTasks() {
    if (!db || !user) {
      tasks = localLoad();
      return;
    }

    try {
      const { data, error } = await db
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      tasks = (data || []).map(item => ({
        id: item.id,
        title: item.title,
        subject: item.subject || '',
        due: item.due_date || '',
        priority: item.priority || 'medium',
        completed: Boolean(item.completed)
      }));
    } catch (error) {
      console.error('Task loading error:', error);
      tasks = localLoad();
    }
  }

  async function persistTask(task, operation = 'insert') {
    if (!db || !user) {
      storage.set(localKey(), JSON.stringify(tasks));
      return;
    }

    if (operation === 'insert') {
      const { data, error } = await db
        .from('tasks')
        .insert({
          user_id: user.id,
          title: task.title,
          subject: task.subject,
          due_date: task.due || null,
          priority: task.priority,
          completed: task.completed
        })
        .select()
        .single();

      if (error) throw error;
      task.id = data.id;
      return;
    }

    if (operation === 'update') {
      const { error } = await db
        .from('tasks')
        .update({
          title: task.title,
          subject: task.subject,
          due_date: task.due || null,
          priority: task.priority,
          completed: task.completed
        })
        .eq('id', task.id)
        .eq('user_id', user.id);

      if (error) throw error;
      return;
    }

    if (operation === 'delete') {
      const { error } = await db
        .from('tasks')
        .delete()
        .eq('id', task.id)
        .eq('user_id', user.id);

      if (error) throw error;
    }
  }

  async function addTask(event) {
    event?.preventDefault();

    const titleInput = $('#task-title');
    const title = titleInput?.value.trim() || '';

    if (!title) {
      toast('Enter a task title.', true);
      return;
    }

    const task = {
      id: `local-${Date.now()}`,
      title,
      subject: $('#task-subject')?.value || '',
      due: $('#task-due')?.value || '',
      priority: $('#task-priority')?.value || 'medium',
      completed: false
    };

    tasks.unshift(task);
    renderTasks();

    try {
      await persistTask(task, 'insert');
      storage.set(localKey(), JSON.stringify(tasks));
      $('#task-form')?.reset();
      $('#task-panel')?.classList.remove('open');
      renderTasks();
      toast('Task added.');
    } catch (error) {
      console.error('Add task error:', error);
      tasks = tasks.filter(item => item !== task);
      renderTasks();
      toast('Could not save task. Check your Supabase tasks table and policies.', true);
    }
  }

  async function toggleTask(id) {
    const task = tasks.find(item => String(item.id) === String(id));
    if (!task) return;

    const previous = task.completed;
    task.completed = !previous;
    renderTasks();

    try {
      await persistTask(task, 'update');
      storage.set(localKey(), JSON.stringify(tasks));
    } catch (error) {
      console.error('Update task error:', error);
      task.completed = previous;
      renderTasks();
      toast('Could not update task.', true);
    }
  }

  async function deleteTask(id) {
    const index = tasks.findIndex(item => String(item.id) === String(id));
    if (index < 0) return;

    const [task] = tasks.splice(index, 1);
    renderTasks();

    try {
      await persistTask(task, 'delete');
      storage.set(localKey(), JSON.stringify(tasks));
      toast('Task deleted.');
    } catch (error) {
      console.error('Delete task error:', error);
      tasks.splice(index, 0, task);
      renderTasks();
      toast('Could not delete task.', true);
    }
  }

  function taskHTML(task, compact = false) {
    return `
      <div class="task-row ${task.completed ? 'completed' : ''}"
           data-task-id="${escapeHTML(task.id)}">
        <button class="task-check" data-action="toggle-task"
                aria-label="${task.completed ? 'Mark incomplete' : 'Mark complete'}"
                type="button">${task.completed ? '✓' : ''}</button>
        <div class="task-main">
          <strong>${escapeHTML(task.title)}</strong>
          <small>${escapeHTML(task.subject || 'General')} · ${escapeHTML(dateText(task.due))}</small>
        </div>
        ${!compact ? `
          <span class="priority priority-${escapeHTML(task.priority)}">
            ${escapeHTML(task.priority)}
          </span>
          <button type="button" data-action="delete-task"
                  class="task-delete" aria-label="Delete task">×</button>
        ` : ''}
      </div>
    `;
  }

  function renderTasks() {
    const pending = tasks.filter(task => !task.completed);
    const completed = tasks.filter(task => task.completed);

    const pendingCount = $('#stat-pending');
    const completedCount = $('#stat-completed');
    const navCount = $('#task-nav-count');

    if (pendingCount) pendingCount.textContent = pending.length;
    if (completedCount) completedCount.textContent = completed.length;
    if (navCount) navCount.textContent = pending.length;

    const percent = tasks.length
      ? Math.round(completed.length / tasks.length * 100)
      : 0;

    const progress = $('#progress-percent');
    if (progress) progress.textContent = `${percent}%`;

    const fill = $('#progress-fill');
    if (fill) fill.style.width = `${percent}%`;

    const caption = $('#progress-caption');
    if (caption) {
      caption.textContent = tasks.length
        ? `${completed.length} of ${tasks.length} tasks completed`
        : 'Add a task to start tracking your progress.';
    }

    const dashboardTasks = $('#dashboard-task-list');
    if (dashboardTasks) {
      dashboardTasks.innerHTML = pending.length
        ? pending.slice(0, 4).map(task => taskHTML(task, true)).join('')
        : '<p class="empty-state">You are all caught up. Add a task to get started!</p>';
    }

    const list = $('#task-list');
    if (list) {
      const filter = $('.task-filter.active')?.dataset.filter || 'all';
      const filtered = tasks.filter(task => {
        if (filter === 'pending') return !task.completed;
        if (filter === 'completed') return task.completed;
        return true;
      });

      list.innerHTML = filtered.length
        ? filtered.map(task => taskHTML(task)).join('')
        : '<p class="empty-state">No tasks here yet.</p>';
    }

    const count = $('#task-list-count');
    if (count) count.textContent = tasks.length;
  }

  function renderStats() {
    const best = $('#quiz-best-score');
    if (best) best.textContent = `${bestScore}%`;
  }

  function renderAll() {
    renderSubjects();
    renderTasks();
    renderStats();
  }

  // =====================================================
  // 11. QUIZ
  // =====================================================

  function startQuiz() {
    quizIndex = 0;
    quizScore = 0;
    quizChoice = null;
    quizChecked = false;
    quizAnswers = [];

    if ($('#quiz-content')) $('#quiz-content').hidden = false;
    if ($('#quiz-result')) $('#quiz-result').hidden = true;

    renderQuiz();
  }

  function renderQuiz() {
    const content = $('#quiz-content');
    if (!content) return;

    if (quizIndex >= questions.length) {
      finishQuiz();
      return;
    }

    const question = questions[quizIndex];
    const number = $('#quiz-question-number');
    const progress = $('#quiz-progress');
    const text = $('#quiz-question');
    const options = $('#quiz-options');
    const feedback = $('#quiz-feedback');
    const next = $('#quiz-next');
    const total = $('#quiz-total');

    if (number) number.textContent = `Question ${quizIndex + 1}`;
    if (progress) progress.style.width =
      `${(quizIndex + 1) / questions.length * 100}%`;
    if (text) text.textContent = question.question;
    if (total) total.textContent = `${quizIndex + 1} of ${questions.length}`;

    if (options) {
      options.innerHTML = question.options.map((option, index) => {
        let className = 'quiz-option';

        if (quizChoice === index) className += ' selected';
        if (quizChecked && index === question.answer) className += ' correct';
        if (quizChecked && quizChoice === index && index !== question.answer) {
          className += ' incorrect';
        }

        return `
          <button type="button" class="${className}"
                  data-quiz-choice="${index}"
                  ${quizChecked ? 'disabled' : ''}>
            <span>${String.fromCharCode(65 + index)}</span>
            ${escapeHTML(option)}
          </button>
        `;
      }).join('');
    }

    if (feedback) {
      feedback.textContent = quizChecked
        ? `${quizChoice === question.answer ? 'Correct!' : 'Not quite.'} ${question.explain}`
        : '';
    }

    if (next) {
      next.disabled = quizChoice === null;
      next.textContent = quizChecked
        ? (quizIndex === questions.length - 1 ? 'See results' : 'Next question')
        : 'Check answer';
    }
  }

  function checkQuiz() {
    if (quizChoice === null) {
      toast('Choose an answer first.');
      return;
    }

    if (!quizChecked) {
      quizChecked = true;

      const question = questions[quizIndex];
      const correct = quizChoice === question.answer;

      if (correct) quizScore++;

      quizAnswers.push({
        question: question.question,
        choice: quizChoice,
        correct
      });

      renderQuiz();
      return;
    }

    quizIndex++;
    quizChoice = null;
    quizChecked = false;
    renderQuiz();
  }

  async function finishQuiz() {
    const content = $('#quiz-content');
    const result = $('#quiz-result');

    if (content) content.hidden = true;
    if (result) result.hidden = false;

    const percent = Math.round(quizScore / questions.length * 100);
    bestScore = Math.max(bestScore, percent);
    storage.set(bestScoreKey, bestScore);

    const score = $('#quiz-final-score');
    const message = $('#quiz-result-message');

    if (score) score.textContent = `${percent}%`;
    if (message) {
      message.textContent = percent >= 80
        ? 'Excellent work! Keep it up.'
        : percent >= 50
          ? 'Good effort. Review the answers and try again.'
          : 'Keep practising. Every attempt helps you learn.';
    }

    renderStats();

    if (db && user) {
      try {
        const { error } = await db.from('quiz_results').insert({
          user_id: user.id,
          score: quizScore,
          total_questions: questions.length,
          percentage: percent
        });

        if (error) console.warn('Quiz result was not saved:', error.message);
      } catch (error) {
        console.warn('Quiz result was not saved:', error);
      }
    }
  }

  // =====================================================
  // 12. STUDY ASSISTANT
  // =====================================================

  function addMessage(text, role = 'assistant') {
    const container = $('#chat-messages');
    if (!container) return null;

    const message = document.createElement('div');
    message.className = `chat-message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'You' : 'AI';

    const body = document.createElement('div');
    body.className = 'message-body';

    const heading = document.createElement('strong');
    heading.textContent = role === 'user' ? 'You' : 'Study Assistant';

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    body.append(heading, paragraph);
    message.append(avatar, body);
    container.appendChild(message);

    container.scrollTop = container.scrollHeight;
    return paragraph;
  }

  async function sendChat(event) {
    event?.preventDefault();

    const input = $('#chat-input');
    const sendButton = $('.send-btn');
    const question = input?.value.trim();

    if (!question) return;

    input.value = '';
    addMessage(question, 'user');
    chatHistory.push({ role: 'user', content: question });

    if (sendButton) sendButton.disabled = true;

    const placeholder = addMessage('Thinking…', 'assistant');

    try {
      if (!db || !user) {
        throw new Error('Sign in to use the study assistant.');
      }

      const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

      if (sessionError) throw sessionError;

      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Your session has expired. Please sign in again.');

      const response = await fetch(
        CONFIG.AI_ENDPOINT || '/api/study-assistant',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            question,
            history: chatHistory.slice(-8)
          })
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || `Assistant request failed (${response.status}).`);
      }

      const answer =
        result.answer ||
        result.message ||
        result.response ||
        'I could not generate an answer. Please try again.';

      if (placeholder) placeholder.textContent = answer;
      chatHistory.push({ role: 'assistant', content: answer });
    } catch (error) {
      console.error('Assistant error:', error);

      if (placeholder) {
        placeholder.textContent =
          `${error.message} The assistant endpoint must be deployed on a backend; a static GitHub Pages site does not run /api routes by itself.`;
      }
    } finally {
      if (sendButton) sendButton.disabled = false;
      input?.focus();
    }
  }

  // =====================================================
  // 13. TEACHER ASSIGNMENTS
  // =====================================================

  async function loadAssignments() {
    if (!db || !user) {
      assignments = [];
      return;
    }

    try {
      const { data, error } = await db
        .from('assignments')
        .select('id, title, subject, description, due_date, teacher_id, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      assignments = data || [];
    } catch (error) {
      console.warn('Assignments could not be loaded:', error.message);
      assignments = [];
    }
  }

  async function renderTeacher() {
    const permitted = ['teacher', 'admin'].includes(profile?.role);
    const denied = $('#teacher-denied');
    const content = $('#teacher-content');

    if (denied) denied.hidden = permitted;
    if (content) content.hidden = !permitted;

    if (!permitted || !db || !user) return;

    await loadAssignments();

    const mine = assignments.filter(item => item.teacher_id === user.id);
    const count = $('#teacher-assignment-count');

    if (count) count.textContent = mine.length;

    const list = $('#teacher-assignment-list');

    if (list) {
      list.innerHTML = mine.length
        ? mine.map(item => `
          <article class="assignment-card">
            <h3>${escapeHTML(item.title)}</h3>
            <p>${escapeHTML(item.subject || 'General')}</p>
            <p>${escapeHTML(item.description || '')}</p>
            <small>Due: ${escapeHTML(dateText(item.due_date))}</small>
          </article>
        `).join('')
        : '<p class="empty-state">You have not created any assignments yet.</p>';
    }
  }

  async function createAssignment(event) {
    event?.preventDefault();

    if (!db || !user) {
      toast('Sign in before creating an assignment.', true);
      return;
    }

    if (!['teacher', 'admin'].includes(profile?.role)) {
      toast('Only approved teachers can create assignments.', true);
      return;
    }

    const title = $('#assignment-title')?.value.trim() || '';

    if (!title) {
      toast('Enter an assignment title.', true);
      return;
    }

    try {
      const { error } = await db.from('assignments').insert({
        title,
        subject: $('#assignment-subject')?.value || '',
        description: $('#assignment-description')?.value.trim() || '',
        due_date: $('#assignment-due')?.value || null,
        teacher_id: user.id
      });

      if (error) throw error;

      $('#assignment-form')?.reset();
      $('#assignment-panel')?.classList.remove('open');

      await renderTeacher();
      toast('Assignment created.');
    } catch (error) {
      console.error('Assignment creation error:', error);
      toast('Could not create assignment. Check your assignments table and RLS policies.', true);
    }
  }

  // =====================================================
  // 14. EVENT HANDLERS
  // =====================================================

  function bind() {
    $('#auth-form')?.addEventListener('submit', handleAuth);

    $('#auth-switch')?.addEventListener('click', event => {
      event.preventDefault();
      showAuth(authMode === 'signin' ? 'signup' : 'signin');
    });

    $('#forgot-password')?.addEventListener('click', event => {
      event.preventDefault();
      resetPassword();
    });

    $('#signout-button')?.addEventListener('click', signOut);
    $('#sign-out')?.addEventListener('click', signOut);

    $('#theme-toggle')?.addEventListener('click', () => {
      setTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
    });

    $('#menu-toggle')?.addEventListener('click', openSidebar);
    $('#sidebar-overlay')?.addEventListener('click', closeSidebar);
    $('#sidebar-close')?.addEventListener('click', closeSidebar);

    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-page]');

      if (nav) {
        event.preventDefault();
        navigate(nav.dataset.page);
        return;
      }

      const go = event.target.closest('[data-go]');

      if (go) {
        event.preventDefault();
        navigate(go.dataset.go);
        return;
      }

      const subjectCard = event.target.closest('[data-subject]');

      if (subjectCard) {
        const select = $('#task-subject');
        if (select) select.value = subjectCard.dataset.subject;
        navigate('tasks');
        return;
      }

      const action = event.target.closest('[data-action]');
      if (!action) return;

      const taskRow = action.closest('[data-task-id]');
      const id = taskRow?.dataset.taskId;

      if (action.dataset.action === 'toggle-task' && id) {
        toggleTask(id);
      }

      if (action.dataset.action === 'delete-task' && id) {
        deleteTask(id);
      }

      const choice = event.target.closest('[data-quiz-choice]');

      if (choice && !quizChecked) {
        quizChoice = Number(choice.dataset.quizChoice);
        renderQuiz();
      }
    });

    $('#task-form')?.addEventListener('submit', addTask);

    ['#task-open', '#add-task-button'].forEach(selector => {
      $(selector)?.addEventListener('click', () => {
        $('#task-panel')?.classList.add('open');
        $('#task-title')?.focus();
      });
    });

    ['#task-close', '#task-cancel'].forEach(selector => {
      $(selector)?.addEventListener('click', () => {
        $('#task-panel')?.classList.remove('open');
      });
    });

    $$('.task-filter').forEach(button => {
      button.addEventListener('click', () => {
        $$('.task-filter').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        renderTasks();
      });
    });

    $('#quiz-start')?.addEventListener('click', startQuiz);
    $('#quiz-restart')?.addEventListener('click', startQuiz);
    $('#quiz-next')?.addEventListener('click', checkQuiz);

    $('#chat-form')?.addEventListener('submit', sendChat);

    $$('.prompt-chip').forEach(button => {
      button.addEventListener('click', () => {
        const input = $('#chat-input');
        if (!input) return;

        input.value =
          button.dataset.prompt ||
          button.textContent.trim();

        input.focus();
      });
    });

    ['#assignment-open', '#add-assignment-button'].forEach(selector => {
      $(selector)?.addEventListener('click', () => {
        $('#assignment-panel')?.classList.add('open');
      });
    });

    ['#assignment-close', '#assignment-cancel'].forEach(selector => {
      $(selector)?.addEventListener('click', () => {
        $('#assignment-panel')?.classList.remove('open');
      });
    });

    $('#assignment-form')?.addEventListener('submit', createAssignment);

    $('#modal-close')?.addEventListener('click', closeModal);
    $('#modal-ok')?.addEventListener('click', closeModal);

    $('#app-modal')?.addEventListener('click', event => {
      if (event.target.id === 'app-modal') closeModal();
    });

    $('#top-user-button')?.addEventListener('click', () => {
      showModal(
        'Account',
        `${user?.email || ''}\nRole: ${profile?.role || 'student'}`
      );
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeModal();
        closeSidebar();
        $('#task-panel')?.classList.remove('open');
        $('#assignment-panel')?.classList.remove('open');
      }
    });
  }

  // =====================================================
  // 15. INITIALIZATION
  // =====================================================

  async function init() {
    setTheme(storage.get('learnhub-theme', 'light'));
    bind();
    renderSubjects();
    renderStats();

    const today = $('#today-label');

    if (today) {
      today.textContent = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
    }

    const year = $('#footer-year');
    if (year) year.textContent = new Date().getFullYear();

    if (!db) {
      console.error(
        'Supabase initialization failed. Check the CDN script and config.js.'
      );

      showAuth(
        'signin',
        'Could not connect to Supabase. Check your configuration and reload the page.'
      );

      tasks = localLoad();
      renderAll();
      return;
    }

    try {
      const { data, error } = await db.auth.getSession();

      if (error) throw error;

      if (data.session?.user) {
        await startSession(data.session.user);
      } else {
        showAuth('signin');
        tasks = localLoad();
        renderAll();
      }

      db.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          user = null;
          profile = null;
          tasks = [];
          assignments = [];
          showAuth('signin');
          renderAll();
          return;
        }

        if (
          session?.user &&
          session.user.id !== user?.id &&
          event !== 'INITIAL_SESSION'
        ) {
          setTimeout(() => {
            startSession(session.user).catch(error => {
              console.error('Session initialization failed:', error);
              showAuth('signin', 'Could not load your account. Please sign in again.');
            });
          }, 0);
        }
      });
    } catch (error) {
      console.error('LearnHub initialization error:', error);

      showAuth(
        'signin',
        `Could not initialize your session: ${explainAuthError(error)}`
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
