
(() => {
  'use strict';

  // ==================================================
  // 1. CONFIGURATION AND SUPABASE
  // ==================================================

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const cfg = window.LEARNHUB_CONFIG || {};

  const configured = Boolean(
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes('YOUR_')
  );

  const supabase =
    configured && window.supabase?.createClient
      ? window.supabase.createClient(
          cfg.SUPABASE_URL,
          cfg.SUPABASE_ANON_KEY
        )
      : null;

  // ==================================================
  // 2. APPLICATION DATA
  // ==================================================

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
      q: 'Which number is a prime number?',
      options: ['21', '29', '35', '39'],
      answer: 1,
      explain: '29 has exactly two positive factors: 1 and 29.'
    },
    {
      q: 'Which part of a plant mainly absorbs sunlight?',
      options: ['Roots', 'Petals', 'Leaves', 'Seeds'],
      answer: 2,
      explain: 'Leaves contain chlorophyll, which absorbs light for photosynthesis.'
    },
    {
      q: 'Which sentence uses the apostrophe correctly?',
      options: [
        'The students book is here.',
        'The student’s book is here.',
        'The students’s book is here.',
        'The student book’s is here.'
      ],
      answer: 1,
      explain: 'Student’s indicates that the book belongs to one student.'
    },
    {
      q: 'What does CPU stand for?',
      options: [
        'Central Processing Unit',
        'Computer Power Utility',
        'Core Program Upload',
        'Central Print Unit'
      ],
      answer: 0,
      explain: 'The CPU executes instructions in a computer.'
    },
    {
      q: 'What is 3/4 expressed as a percentage?',
      options: ['25%', '50%', '70%', '75%'],
      answer: 3,
      explain: '3 divided by 4 is 0.75, or 75%.'
    }
  ];

  // ==================================================
  // 3. APPLICATION STATE AND STORAGE
  // ==================================================

  let user = null;
  let profile = null;
  let authMode = 'signin';
  let currentPage = 'dashboard';
  let tasks = [];
  let assignments = [];
  let filter = 'all';
  let quizIndex = 0;
  let quizScore = 0;
  let quizChoice = null;
  let quizChecked = false;
  let quizAnswers = [];
  let chatHistory = [];

  const storage = {
    get(key, fallback = '') {
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.warn('Local storage unavailable:', error);
      }
    }
  };

  let bestScore = Number(
    storage.get('learnhub-best-score', '0')
  ) || 0;

  const localKey = () =>
    `learnhub-tasks-${user?.id || 'guest'}`;

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

    const date = new Date(
      `${String(value).slice(0, 10)}T12:00:00`
    );

    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year:
            date.getFullYear() !== new Date().getFullYear()
              ? 'numeric'
              : undefined
        });
  };

  // ==================================================
  // 4. USER FEEDBACK AND THEME
  // ==================================================

  function toast(message, error = false) {
    const region = $('#toast-region');

    if (!region) {
      console[error ? 'error' : 'log'](message);
      return;
    }

    const element = document.createElement('div');
    element.className = `toast${error ? ' error' : ''}`;
    element.textContent = message;
    region.append(element);

    setTimeout(() => element.remove(), 3600);
  }

  function showModal(title, message) {
    if (!$('#modal-overlay')) return;

    $('#modal-title').textContent = title;
    $('#modal-message').textContent = message;
    $('#modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    $('#modal-overlay')?.classList.add('hidden');
  }

  function setTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    storage.set('learnhub-theme', theme);

    if ($('#theme-toggle')) {
      $('#theme-toggle').textContent =
        theme === 'dark' ? '☀' : '☾';
    }
  }

  // ==================================================
  // 5. AUTHENTICATION
  // ==================================================

  function showAuth(mode = 'signin', message = '') {
    authMode = mode;

    $('#auth-screen')?.classList.remove('hidden');
    $('#app-shell')?.classList.add('hidden');

    if ($('#auth-title')) {
      $('#auth-title').textContent =
        mode === 'signup'
          ? 'Create your account'
          : 'Welcome back';
    }

    if ($('#auth-subtitle')) {
      $('#auth-subtitle').textContent =
        mode === 'signup'
          ? 'A few details and you’re ready to learn.'
          : 'Sign in to pick up where you left off.';
    }

    if ($('#auth-submit')) {
      $('#auth-submit').innerHTML =
        mode === 'signup'
          ? 'Create account <span>→</span>'
          : 'Sign in <span>→</span>';
    }

    if ($('#auth-switch-copy')) {
      $('#auth-switch-copy').textContent =
        mode === 'signup'
          ? 'Already have an account?'
          : 'New to LearnHub?';
    }

    if ($('#auth-switch')) {
      $('#auth-switch').textContent =
        mode === 'signup' ? 'Sign in' : 'Create an account';
    }

    $('#name-field')?.classList.toggle('hidden', mode !== 'signup');
    $('#role-field')?.classList.toggle('hidden', mode !== 'signup');

    if ($('#auth-name')) {
      $('#auth-name').required = mode === 'signup';
    }

    if ($('#auth-password')) {
      $('#auth-password').autocomplete =
        mode === 'signup' ? 'new-password' : 'current-password';
    }

    if ($('#auth-message')) {
      $('#auth-message').textContent = message;
    }
  }

  function explainAuthError(error) {
    const message = String(error?.message || '').toLowerCase();

    if (message.includes('invalid login credentials')) {
      return 'Incorrect email or password. Check your email and current password.';
    }

    if (message.includes('email not confirmed')) {
      return 'Confirm your email using the link sent to your inbox.';
    }

    if (message.includes('user already registered')) {
      return 'This email already has an account. Switch to Sign in.';
    }

    if (
      message.includes('failed to fetch') ||
      message.includes('network')
    ) {
      return 'Could not reach Supabase. Check your connection and project URL.';
    }

    if (
      message.includes('password should be') ||
      message.includes('password must')
    ) {
      return error.message;
    }

    if (
      message.includes('rate limit') ||
      message.includes('too many requests')
    ) {
      return 'Too many attempts. Wait a while before trying again.';
    }

    return error?.message || 'Authentication failed. Please try again.';
  }

  async function getProfile() {
    if (!supabase || !user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id,display_name,role,teacher_approved')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Profile lookup failed:', error);
      toast('Your account is signed in, but your profile could not load.', true);
      return null;
    }

    return data;
  }

  function showApp() {
    $('#auth-screen')?.classList.add('hidden');
    $('#app-shell')?.classList.remove('hidden');

    const name =
      profile?.display_name ||
      user?.user_metadata?.full_name ||
      user?.email?.split('@')[0] ||
      'Student';

    const role = profile?.role || 'student';

    if ($('#sidebar-user-name')) {
      $('#sidebar-user-name').textContent = name;
    }

    if ($('#sidebar-user-role')) {
      $('#sidebar-user-role').textContent =
        role === 'admin'
          ? 'Administrator account'
          : role === 'teacher'
            ? 'Teacher account'
            : 'Student account';
    }

    if ($('#user-avatar')) {
      $('#user-avatar').textContent = (name.trim()[0] || 'S').toUpperCase();
    }

    if ($('#top-avatar')) {
      $('#top-avatar').textContent = (name.trim()[0] || 'S').toUpperCase();
    }

    if ($('#top-user-name')) {
      $('#top-user-name').textContent = name;
    }

    if ($('#welcome-title')) {
      $('#welcome-title').innerHTML = 'Good to see you <span>✦</span>';
    }

    $('#teacher-nav')?.classList.toggle(
      'hidden',
      !['teacher', 'admin'].includes(role)
    );

    if ($('#today-label')) {
      $('#today-label').textContent = new Date().toLocaleDateString(
        undefined,
        { weekday: 'short', day: 'numeric', month: 'short' }
      );
    }

    if ($('#footer-year')) {
      $('#footer-year').textContent = new Date().getFullYear();
    }
  }

  async function startSession(sessionUser) {
    user = sessionUser;
    profile = await getProfile();

    showApp();
    await loadTasks();
    await loadAssignments();

    renderAll();
    navigate('dashboard');
  }

  async function handleAuth(event) {
    event.preventDefault();

    const email = $('#auth-email')?.value.trim();
    const password = $('#auth-password')?.value;
    const submit = $('#auth-submit');
    const message = $('#auth-message');

    if (!email || !password) {
      if (message) message.textContent = 'Enter your email and password.';
      return;
    }

    if (submit) submit.disabled = true;
    if (message) message.textContent = '';

    try {
      if (!supabase) {
        throw new Error(
          'Supabase is not initialized. Check config.js and the Supabase script in index.html.'
        );
      }

      if (authMode === 'signup') {
        const fullName = $('#auth-name')?.value.trim() || '';
        const requestedRole = $('#auth-role')?.value || 'student';

        if (!fullName) {
          throw new Error('Enter your name to create an account.');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              requested_role: requestedRole
            }
          }
        });

        if (error) throw error;

        if (data.session && data.user) {
          await startSession(data.user);

          if (requestedRole === 'teacher' && profile?.role !== 'teacher') {
            toast('Account created. Teacher access may require administrator approval.');
          }
        } else {
          if (message) {
            message.textContent =
              'Account created. Check your email for confirmation, then sign in.';
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        if (!data.user) throw new Error('Supabase did not return a user.');

        await startSession(data.user);
        toast('Welcome back!');
      }
    } catch (error) {
      console.error('Authentication error:', error);

      if (message) {
        message.textContent = explainAuthError(error);
      } else {
        toast(explainAuthError(error), true);
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function resetPassword() {
    if (!supabase) {
      toast('Supabase is not configured.', true);
      return;
    }

    const email = $('#auth-email')?.value.trim();

    if (!email) {
      if ($('#auth-message')) {
        $('#auth-message').textContent =
          'Enter your email address first.';
      }
      return;
    }

    try {
      const redirectTo =
        `${window.location.origin}${window.location.pathname}`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      });

      if (error) throw error;

      if ($('#auth-message')) {
        $('#auth-message').textContent =
          'If an account exists, a password recovery email will be sent.';
      }
    } catch (error) {
      console.error('Password recovery error:', error);

      if ($('#auth-message')) {
        $('#auth-message').textContent = explainAuthError(error);
      }
    }
  }

  async function signOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();

      if (error) {
        toast('Could not sign out. Please try again.', true);
        return;
      }
    }

    user = null;
    profile = null;
    tasks = [];
    assignments = [];
    chatHistory = [];

    closeSidebar();
    showAuth('signin');
  }

  // ==================================================
  // 6. NAVIGATION
  // ==================================================

  function navigate(page) {
    if (
      page === 'teacher' &&
      !['teacher', 'admin'].includes(profile?.role)
    ) {
      page = 'dashboard';
      toast('Teacher Studio requires an authorised teacher or admin account.', true);
    }

    currentPage = page;

    $$('.page').forEach(element => {
      element.classList.toggle('active', element.id === `page-${page}`);
    });

    $$('.nav-item[data-page]').forEach(element => {
      element.classList.toggle('active', element.dataset.page === page);
    });

    const labels = {
      dashboard: 'Overview',
      subjects: 'My subjects',
      tasks: 'Tasks & deadlines',
      quiz: 'Practice quiz',
      assistant: 'AI study buddy',
      teacher: 'Teacher studio'
    };

    if ($('#page-breadcrumb')) {
      $('#page-breadcrumb').textContent = labels[page] || 'Overview';
    }

    closeSidebar();

    if (page === 'quiz') renderQuiz();

    if (page === 'assistant') {
      $('#chat-input')?.focus({ preventScroll: true });
    }

    if (page === 'teacher') {
      renderTeacher();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('open');
    $('#sidebar-scrim')?.classList.add('show');
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('open');
    $('#sidebar-scrim')?.classList.remove('show');
  }

  // ==================================================
  // 7. SUBJECTS
  // ==================================================

  function renderSubjects() {
    const grid = $('#subjects-grid');
    const dashboard = $('#dashboard-subjects');

    const subjectCard = subject => `
      <article class="subject-card">
        <div class="subject-card-top">
          <span class="subject-symbol ${subject.color}">${subject.icon}</span>
          <span class="eyebrow">SUBJECT</span>
        </div>
        <h3>${escapeHTML(subject.name)}</h3>
        <p>${escapeHTML(subject.desc)}</p>
        <div class="subject-card-bottom">
          <span>${escapeHTML(subject.topics)}</span>
          <button class="subject-open" data-subject-task="${escapeHTML(subject.name)}">
            View tasks →
          </button>
        </div>
      </article>`;

    if (grid) {
      grid.innerHTML = subjects.map(subjectCard).join('');
    }

    if (dashboard) {
      dashboard.innerHTML = subjects.map(subject => `
        <div class="subject-mini" data-subject-task="${escapeHTML(subject.name)}">
          <span class="subject-symbol ${subject.color}">${subject.icon}</span>
          <div>
            <strong>${escapeHTML(subject.name)}</strong>
            <small>${escapeHTML(subject.topics.split(' · ')[0])} and more</small>
          </div>
        </div>
      `).join('');
    }

    if ($('#stat-subjects')) {
      $('#stat-subjects').textContent = subjects.length;
    }

    ['#task-subject', '#assignment-subject'].forEach(selector => {
      const select = $(selector);

      if (select) {
        select.innerHTML = subjects.map(subject =>
          `<option value="${escapeHTML(subject.name)}">${escapeHTML(subject.name)}</option>`
        ).join('');
      }
    });
  }

  // ==================================================
  // 8. TASKS
  // ==================================================

  function localLoad() {
    try {
      return JSON.parse(storage.get(localKey(), '[]'));
    } catch {
      return [];
    }
  }

  async function loadTasks() {
    if (!supabase || !user) {
      tasks = localLoad();
      return;
    }

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Task loading failed:', error);
      tasks = localLoad();
      toast('Could not sync tasks. Showing locally saved tasks.', true);
      return;
    }

    tasks = (data || []).map(task => ({
      id: task.id,
      title: task.title,
      subject: task.subject,
      due: task.due_date,
      priority: task.priority || 'normal',
      completed: Boolean(task.completed)
    }));
  }

  async function persistTask(task, operation = 'insert') {
    if (!supabase || !user) {
      storage.set(localKey(), JSON.stringify(tasks));
      return;
    }

    if (operation === 'insert') {
      const { data, error } = await supabase
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
      const { error } = await supabase
        .from('tasks')
        .update({
          completed: task.completed,
          title: task.title,
          subject: task.subject,
          due_date: task.due || null,
          priority: task.priority
        })
        .eq('id', task.id)
        .eq('user_id', user.id);

      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', task.id)
      .eq('user_id', user.id);

    if (error) throw error;
  }

  async function addTask(event) {
    event.preventDefault();

    const title = $('#task-title')?.value.trim();
    if (!title) return;

    const task = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()),
      title,
      subject: $('#task-subject')?.value || 'Mathematics',
      due: $('#task-due')?.value || '',
      priority: $('#task-priority')?.value || 'normal',
      completed: false
    };

    tasks.unshift(task);

    try {
      await persistTask(task, 'insert');

      $('#task-form')?.reset();
      $('#task-form-panel')?.classList.add('hidden');

      renderAll();
      toast('Task added.');
    } catch (error) {
      tasks = tasks.filter(item => item !== task);
      renderAll();
      toast(`Could not save task: ${error.message}`, true);
    }
  }

  async function toggleTask(id) {
    const task = tasks.find(item => String(item.id) === String(id));
    if (!task) return;

    const previous = task.completed;
    task.completed = !previous;
    renderAll();

    try {
      await persistTask(task, 'update');
    } catch (error) {
      task.completed = previous;
      renderAll();
      toast(`Could not update task: ${error.message}`, true);
    }
  }

  async function deleteTask(id) {
    const task = tasks.find(item => String(item.id) === String(id));
    if (!task) return;

    tasks = tasks.filter(item => String(item.id) !== String(id));
    renderAll();

    try {
      await persistTask(task, 'delete');
      toast('Task removed.');
    } catch (error) {
      tasks.push(task);
      renderAll();
      toast(`Could not delete task: ${error.message}`, true);
    }
  }

  function taskHTML(task, compact = false) {
    return `
      <div class="${compact ? 'compact-task' : 'task-row'} ${task.completed ? 'completed' : ''}">
        <button
          class="task-check ${task.completed ? 'checked' : ''}"
          data-toggle-task="${escapeHTML(task.id)}"
          aria-label="${task.completed ? 'Mark incomplete' : 'Mark complete'}"
        >${task.completed ? '✓' : ''}</button>
        <div class="task-main">
          <strong>${escapeHTML(task.title)}</strong>
          <small>
            ${escapeHTML(task.subject)}
            ${compact ? '' : `<span class="priority ${escapeHTML(task.priority)}">${escapeHTML(task.priority)} priority</span>`}
          </small>
        </div>
        <span class="task-due">${escapeHTML(dateText(task.due))}</span>
        ${compact ? '' : `
          <div class="task-row-actions">
            <button data-delete-task="${escapeHTML(task.id)}" aria-label="Delete task">✕</button>
          </div>
        `}
      </div>`;
  }

  function renderTasks() {
    const pending = tasks.filter(task => !task.completed);
    const completed = tasks.filter(task => task.completed);

    if ($('#stat-pending')) {
      $('#stat-pending').textContent = pending.length;
    }

    if ($('#stat-completed')) {
      $('#stat-completed').textContent = completed.length;
    }

    if ($('#task-nav-count')) {
      $('#task-nav-count').textContent = pending.length;
    }

    const percent = tasks.length
      ? Math.round(completed.length / tasks.length * 100)
      : 0;

    if ($('#progress-percent')) {
      $('#progress-percent').textContent = `${percent}%`;
    }

    if ($('#progress-fill')) {
      $('#progress-fill').style.width = `${percent}%`;
    }

    if ($('#progress-caption')) {
      $('#progress-caption').textContent = tasks.length
        ? `${completed.length} of ${tasks.length} tasks completed.`
        : 'Complete a task to start your progress journey.';
    }

    const dashboard = $('#dashboard-tasks');

    if (dashboard) {
      dashboard.innerHTML = pending
        .slice()
        .sort((a, b) =>
          (a.due || '9999').localeCompare(b.due || '9999')
        )
        .slice(0, 4)
        .map(task => taskHTML(task, true))
        .join('') ||
        '<div class="empty-state"><h3>All clear for now</h3><p>Add a task when you are ready.</p></div>';
    }

    const shown = tasks
      .filter(task =>
        filter === 'all' ||
        (filter === 'pending' && !task.completed) ||
        (filter === 'completed' && task.completed)
      )
      .sort((a, b) => Number(a.completed) - Number(b.completed));

    const list = $('#task-list');

    if (list) {
      list.innerHTML = shown.map(task => taskHTML(task)).join('') ||
        `<div class="empty-state panel">
          <h3>Nothing on your list</h3>
          <p>Add a task to turn your goals into small steps.</p>
          <button class="btn btn-primary" data-open-task>＋ Add a task</button>
        </div>`;
    }

    if ($('#task-list-count')) {
      $('#task-list-count').textContent =
        `${shown.length} task${shown.length === 1 ? '' : 's'}`;
    }
  }

  function renderStats() {
    const score = bestScore ? `${bestScore}%` : '—';

    if ($('#stat-score')) $('#stat-score').textContent = score;
    if ($('#quiz-best-label')) $('#quiz-best-label').textContent = score;
  }

  function renderAll() {
    renderSubjects();
    renderTasks();
    renderStats();
  }

  // ==================================================
  // 9. PRACTICE QUIZ
  // ==================================================

  function startQuiz() {
    quizIndex = 0;
    quizScore = 0;
    quizChoice = null;
    quizChecked = false;
    quizAnswers = [];

    $('#quiz-content')?.classList.remove('hidden');
    $('#quiz-result')?.classList.add('hidden');

    renderQuiz();
  }

  function renderQuiz() {
    if (quizIndex >= questions.length) {
      finishQuiz();
      return;
    }

    const question = questions[quizIndex];
    const area = $('#quiz-question-area');

    if (!area) return;

    if ($('#quiz-step-label')) {
      $('#quiz-step-label').textContent =
        `QUESTION ${quizIndex + 1} OF ${questions.length}`;
    }

    if ($('#quiz-progress-label')) {
      $('#quiz-progress-label').textContent =
        `${Math.round(quizIndex / questions.length * 100)}% complete`;
    }

    if ($('#quiz-progress-fill')) {
      $('#quiz-progress-fill').style.width =
        `${quizIndex / questions.length * 100}%`;
    }

    area.innerHTML = `
      <h2 class="quiz-question">${escapeHTML(question.q)}</h2>
      <div class="quiz-options">
        ${question.options.map((option, index) => `
          <button
            class="quiz-option ${quizChoice === index ? 'selected' : ''} ${quizChecked && index === question.answer ? 'correct' : ''} ${quizChecked && quizChoice === index && index !== question.answer ? 'incorrect' : ''}"
            data-quiz-option="${index}"
            ${quizChecked ? 'disabled' : ''}
          >
            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
            <span>${escapeHTML(option)}</span>
          </button>
        `).join('')}
      </div>
      ${quizChecked ? `
        <div class="quiz-feedback ${quizChoice === question.answer ? 'good' : 'bad'}">
          ${quizChoice === question.answer ? 'Correct!' : `The answer is ${escapeHTML(question.options[question.answer])}.`}
          ${escapeHTML(question.explain)}
        </div>` : ''}
    `;

    if ($('#quiz-next')) {
      $('#quiz-next').disabled = quizChoice === null;
      $('#quiz-next').textContent = quizChecked
        ? quizIndex === questions.length - 1
          ? 'See my results →'
          : 'Next question →'
        : 'Check answer →';
    }

    if ($('#quiz-total-label')) {
      $('#quiz-total-label').textContent = questions.length;
    }
  }

  function chooseQuiz(index) {
    if (quizChecked) return;
    quizChoice = index;
    renderQuiz();
  }

  function checkQuiz() {
    if (quizChoice === null) return;

    if (!quizChecked) {
      quizChecked = true;

      const correct = quizChoice === questions[quizIndex].answer;
      if (correct) quizScore++;

      quizAnswers.push({
        question: questions[quizIndex].q,
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

  function finishQuiz() {
    const percentage = Math.round(
      quizScore / questions.length * 100
    );

    bestScore = Math.max(bestScore, percentage);
    storage.set('learnhub-best-score', String(bestScore));

    $('#quiz-content')?.classList.add('hidden');
    $('#quiz-result')?.classList.remove('hidden');

    if ($('#quiz-result')) {
      $('#quiz-result').innerHTML = `
        <div class="result-icon">${percentage >= 80 ? '✦' : '✧'}</div>
        <span class="eyebrow">QUIZ COMPLETE</span>
        <h2>${percentage >= 80 ? 'Brilliant effort!' : percentage >= 50 ? 'Good progress!' : 'Keep practising!'}</h2>
        <div class="result-score">${percentage}%</div>
        <p>You answered ${quizScore} out of ${questions.length} correctly.</p>
        <button id="quiz-restart" class="btn btn-primary">Try again ↻</button>`;
    }

    renderStats();

    if (supabase && user) {
      supabase.from('quiz_results').insert({
        user_id: user.id,
        quiz_key: 'general-foundations-v1',
        score: quizScore,
        total_questions: questions.length,
        percentage,
        answers: quizAnswers
      }).then(({ error }) => {
        if (error) {
          console.warn('Quiz result was not synced:', error.message);
        }
      });
    }
  }

  // ==================================================
  // 10. AI STUDY ASSISTANT
  // ==================================================

  function addMessage(text, role) {
    const container = $('#chat-messages');
    if (!container) return null;

    const wrap = document.createElement('div');
    wrap.className =
      `chat-message ${role === 'user' ? 'user-message' : 'assistant-message'}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user'
      ? (profile?.display_name?.[0] || 'S')
      : '✧';

    const body = document.createElement('div');
    body.className = 'message-body';

    const heading = document.createElement('strong');
    heading.textContent = role === 'user' ? 'You' : 'Study buddy';

    const paragraph = document.createElement('p');
    paragraph.textContent = text;

    body.append(heading, paragraph);
    wrap.append(avatar, body);
    container.append(wrap);
    container.scrollTop = container.scrollHeight;

    return paragraph;
  }

  async function sendChat(event) {
    event.preventDefault();

    const input = $('#chat-input');
    const question = input?.value.trim();

    if (!question) return;

    input.value = '';
    addMessage(question, 'user');

    const placeholder = addMessage(
      'Thinking through that with you…',
      'assistant'
    );

    const sendButton = $('.send-btn');
    if (sendButton) sendButton.disabled = true;

    try {
      if (!supabase || !user) {
        throw new Error('Sign in to use the study assistant.');
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch(
        cfg.AI_ENDPOINT || '/api/study-assistant',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            question,
            history: chatHistory.slice(-8)
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `Assistant request failed (${response.status}).`
        );
      }

      const answer = data.answer ||
        'I could not generate an answer. Please try again.';

      if (placeholder) placeholder.textContent = answer;

      chatHistory.push(
        { role: 'user', content: question },
        { role: 'assistant', content: answer }
      );
    } catch (error) {
      if (placeholder) {
        placeholder.textContent = error.message || 'Something went wrong.';
      }
      toast('Study buddy could not respond.', true);
    } finally {
      if (sendButton) sendButton.disabled = false;

      if ($('#chat-messages')) {
        $('#chat-messages').scrollTop =
          $('#chat-messages').scrollHeight;
      }
    }
  }

  // ==================================================
  // 11. ASSIGNMENTS AND TEACHER STUDIO
  // ==================================================

  async function loadAssignments() {
    if (!supabase || !user) {
      assignments = [];
      return;
    }

    const { data, error } = await supabase
      .from('assignments')
      .select('id,title,subject,description,due_date,teacher_id,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Assignments could not load:', error.message);
      assignments = [];
    } else {
      assignments = data || [];
    }
  }

  async function renderTeacher() {
    const allowed = ['teacher', 'admin'].includes(profile?.role);

    $('#teacher-denied')?.classList.toggle('hidden', allowed);
    $('#teacher-content')?.classList.toggle('hidden', !allowed);

    if (!allowed || !supabase || !user) return;

    await loadAssignments();

    const mine = assignments.filter(
      item => item.teacher_id === user.id
    );

    if ($('#teacher-assignment-count')) {
      $('#teacher-assignment-count').textContent = mine.length;
    }

    if ($('#teacher-submission-count')) {
      const ids = mine.map(item => item.id);

      if (ids.length) {
        const { count, error } = await supabase
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .in('assignment_id', ids);

        if (error) {
          console.warn('Submissions could not load:', error.message);
          $('#teacher-submission-count').textContent = '—';
        } else {
          $('#teacher-submission-count').textContent = count || 0;
        }
      } else {
        $('#teacher-submission-count').textContent = 0;
      }
    }

    if ($('#teacher-assignments')) {
      $('#teacher-assignments').innerHTML = mine.map(item => `
        <article class="assignment-card">
          <h4>${escapeHTML(item.title)}</h4>
          <p>${escapeHTML(item.description)}</p>
          <div class="assignment-meta">
            <span>${escapeHTML(item.subject)}</span>
            <span>Due: ${escapeHTML(dateText(item.due_date))}</span>
            <span>Published ${escapeHTML(dateText(item.created_at?.slice(0, 10)))}</span>
          </div>
        </article>
      `).join('') ||
      '<div class="empty-state"><h3>Your classroom starts here</h3><p>Create your first assignment.</p></div>';
    }
  }

  async function createAssignment(event) {
    event.preventDefault();

    if (
      !['teacher', 'admin'].includes(profile?.role) ||
      !supabase ||
      !user
    ) {
      toast('Authorised teacher or admin access is required.', true);
      return;
    }

    const assignment = {
      teacher_id: user.id,
      title: $('#assignment-title')?.value.trim(),
      subject: $('#assignment-subject')?.value,
      description: $('#assignment-description')?.value.trim(),
      due_date: $('#assignment-due')?.value || null
    };

    if (!assignment.title) {
      toast('Enter an assignment title.', true);
      return;
    }

    try {
      const { error } = await supabase
        .from('assignments')
        .insert(assignment);

      if (error) throw error;

      $('#assignment-form')?.reset();
      $('#assignment-form-panel')?.classList.add('hidden');

      await renderTeacher();
      toast('Assignment published.');
    } catch (error) {
      toast(`Could not publish assignment: ${error.message}`, true);
    }
  }

  // ==================================================
  // 12. EVENT HANDLERS
  // ==================================================

  function bind() {
    $('#auth-form')?.addEventListener('submit', handleAuth);

    $('#auth-switch')?.addEventListener('click', () => {
      showAuth(authMode === 'signin' ? 'signup' : 'signin');
    });

    $('#forgot-password')?.addEventListener('click', resetPassword);
    $('#signout-btn')?.addEventListener('click', signOut);

    $('#theme-toggle')?.addEventListener('click', () => {
      setTheme(
        document.body.classList.contains('dark') ? 'light' : 'dark'
      );
    });

    $('#menu-toggle')?.addEventListener('click', openSidebar);
    $('#sidebar-close')?.addEventListener('click', closeSidebar);
    $('#sidebar-scrim')?.addEventListener('click', closeSidebar);

    $$('.nav-item[data-page]').forEach(button => {
      button.addEventListener('click', () => navigate(button.dataset.page));
    });

    $$('[data-go]').forEach(button => {
      button.addEventListener('click', () => navigate(button.dataset.go));
    });

    $('#top-user')?.addEventListener('click', () => {
      showModal(
        'Your account',
        `${profile?.display_name || user?.email || 'Student'} · ${profile?.role || 'student'} account`
      );
    });

    $('#modal-close')?.addEventListener('click', closeModal);
    $('#modal-ok')?.addEventListener('click', closeModal);

    $('#modal-overlay')?.addEventListener('click', event => {
      if (event.target === $('#modal-overlay')) closeModal();
    });

    $('#task-form')?.addEventListener('submit', addTask);

    $('#add-task-open')?.addEventListener('click', () => {
      $('#task-form-panel')?.classList.remove('hidden');
    });

    $('#task-form-close')?.addEventListener('click', () => {
      $('#task-form-panel')?.classList.add('hidden');
    });

    $('#task-cancel')?.addEventListener('click', () => {
      $('#task-form-panel')?.classList.add('hidden');
    });

    $('#task-filter-tabs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;

      filter = button.dataset.filter;

      $$('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab === button);
      });

      renderTasks();
    });

    document.addEventListener('click', event => {
      const toggle = event.target.closest('[data-toggle-task]');
      if (toggle) toggleTask(toggle.dataset.toggleTask);

      const remove = event.target.closest('[data-delete-task]');
      if (remove) deleteTask(remove.dataset.deleteTask);

      const openTask = event.target.closest('[data-open-task]');
      if (openTask) {
        $('#task-form-panel')?.classList.remove('hidden');
        $('#task-title')?.focus();
      }

      const subject = event.target.closest('[data-subject-task]');

      if (subject) {
        if ($('#task-subject')) {
          $('#task-subject').value = subject.dataset.subjectTask;
        }

        navigate('tasks');
        $('#task-form-panel')?.classList.remove('hidden');
      }
    });

    $('#quiz-question-area')?.addEventListener('click', event => {
      const button = event.target.closest('[data-quiz-option]');
      if (button) chooseQuiz(Number(button.dataset.quizOption));
    });

    $('#quiz-next')?.addEventListener('click', checkQuiz);

    $('#quiz-result')?.addEventListener('click', event => {
      if (event.target.closest('#quiz-restart')) startQuiz();
    });

    $('#chat-form')?.addEventListener('submit', sendChat);

    $$('[data-prompt]').forEach(button => {
      button.addEventListener('click', () => {
        if ($('#chat-input')) {
          $('#chat-input').value = button.dataset.prompt;
          $('#chat-input').focus();
        }
      });
    });

    $('#assignment-open')?.addEventListener('click', () => {
      $('#assignment-form-panel')?.classList.remove('hidden');
    });

    $('#assignment-close')?.addEventListener('click', () => {
      $('#assignment-form-panel')?.classList.add('hidden');
    });

    $('#assignment-form')?.addEventListener('submit', createAssignment);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeSidebar();
        closeModal();
      }
    });
  }

  // ==================================================
  // 13. INITIALIZATION
  // ==================================================

  async function init() {
    setTheme(storage.get('learnhub-theme', 'light'));

    bind();
    renderSubjects();
    renderStats();

    if ($('#today-label')) {
      $('#today-label').textContent = new Date().toLocaleDateString(
        undefined,
        { weekday: 'short', day: 'numeric', month: 'short' }
      );
    }

    if ($('#footer-year')) {
      $('#footer-year').textContent = new Date().getFullYear();
    }

    if (!supabase) {
      tasks = localLoad();
      showAuth('signin');

      if ($('#auth-message')) {
        $('#auth-message').textContent =
          'Supabase is not configured. Check config.js and the Supabase script in index.html.';
      }

      return;
    }

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (data.session?.user) {
        await startSession(data.session.user);
      } else {
        showAuth('signin');
      }

      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          user = null;
          profile = null;
          tasks = [];
          assignments = [];
          chatHistory = [];
          showAuth('signin');
        } else if (
          session?.user &&
          (!user || user.id !== session.user.id)
        ) {
          setTimeout(() => {
            startSession(session.user).catch(error => {
              console.error('Session initialization failed:', error);
              toast('Could not load your account dashboard.', true);
            });
          }, 0);
        }
      });
    } catch (error) {
      console.error('LearnHub initialization failed:', error);

      showAuth('signin');

      if ($('#auth-message')) {
        $('#auth-message').textContent =
          'Could not initialize your session. Refresh the page and try again.';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
