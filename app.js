
(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const cfg = window.LEARNHUB_CONFIG || {};

  const configured = Boolean(
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('YOUR_PROJECT') &&
    !cfg.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')
  );

  const supabase =
    configured && window.supabase
      ? window.supabase.createClient(
          cfg.SUPABASE_URL,
          cfg.SUPABASE_ANON_KEY
        )
      : null;

  const subjects = [
    {
      name: 'Mathematics',
      key: 'math',
      icon: '∑',
      desc: 'Explore numbers, patterns, equations and the logic behind them.',
      topics: 'Algebra · Geometry · Number',
      color: 'math'
    },
    {
      name: 'English',
      key: 'english',
      icon: 'Aa',
      desc: 'Build confidence in reading, writing, grammar and communication.',
      topics: 'Reading · Writing · Grammar',
      color: 'english'
    },
    {
      name: 'Science',
      key: 'science',
      icon: '⚗',
      desc: 'Ask questions, test ideas and discover how the world works.',
      topics: 'Biology · Chemistry · Physics',
      color: 'science'
    },
    {
      name: 'ICT',
      key: 'ict',
      icon: '⌘',
      desc: 'Develop digital skills and understand the technology around you.',
      topics: 'Computing · Coding · Digital skills',
      color: 'ict'
    }
  ];

  const questions = [
    {
      q: 'Which number is a prime number?',
      options: ['21', '29', '35', '39'],
      answer: 1,
      explain: '29 is prime because its only positive factors are 1 and 29.'
    },
    {
      q: 'Which part of a plant mainly absorbs sunlight for photosynthesis?',
      options: ['Roots', 'Petals', 'Leaves', 'Seeds'],
      answer: 2,
      explain: 'Leaves contain chlorophyll, which absorbs light energy for photosynthesis.'
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
      explain: '“Student’s” uses an apostrophe to show that the book belongs to one student.'
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
      explain: 'CPU stands for Central Processing Unit. It executes instructions in a computer.'
    },
    {
      q: 'What is 3/4 expressed as a percentage?',
      options: ['25%', '50%', '70%', '75%'],
      answer: 3,
      explain: '3 ÷ 4 = 0.75, and 0.75 × 100 = 75%.'
    }
  ];

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
  let bestScore = Number(localStorage.getItem('learnhub-best-score') || 0);
  let chatHistory = [];

  const localKey = () => `learnhub-tasks-${user?.id || 'guest'}`;

  const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const dateText = value => {
    if (!value) return 'No deadline';

    const d = new Date(`${value}T12:00:00`);

    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: d.getFullYear() !== new Date().getFullYear()
            ? 'numeric'
            : undefined
        });
  };

  function toast(message, error = false) {
    const el = document.createElement('div');
    el.className = `toast${error ? ' error' : ''}`;
    el.textContent = message;
    $('#toast-region').append(el);
    setTimeout(() => el.remove(), 3600);
  }

  function showModal(title, message) {
    $('#modal-title').textContent = title;
    $('#modal-message').textContent = message;
    $('#modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    $('#modal-overlay').classList.add('hidden');
  }

  function setTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('learnhub-theme', theme);
    $('#theme-toggle').textContent = theme === 'dark' ? '☀' : '☾';
  }

  function showAuth(mode = 'signin', message = '') {
    authMode = mode;

    $('#auth-screen').classList.remove('hidden');
    $('#app-shell').classList.add('hidden');

    $('#auth-title').textContent =
      mode === 'signup' ? 'Create your account' : 'Welcome back';

    $('#auth-subtitle').textContent =
      mode === 'signup'
        ? 'A few details and you’re ready to learn.'
        : 'Sign in to pick up where you left off.';

    $('#auth-submit').innerHTML =
      mode === 'signup'
        ? 'Create account <span>→</span>'
        : 'Sign in <span>→</span>';

    $('#auth-switch-copy').textContent =
      mode === 'signup'
        ? 'Already have an account?'
        : 'New to LearnHub?';

    $('#auth-switch').textContent =
      mode === 'signup' ? 'Sign in' : 'Create an account';

    $('#name-field').classList.toggle('hidden', mode !== 'signup');
    $('#role-field').classList.toggle('hidden', mode !== 'signup');

    $('#auth-name').required = mode === 'signup';

    $('#auth-password').autocomplete =
      mode === 'signup' ? 'new-password' : 'current-password';

    $('#auth-message').textContent = message;
  }

  // Updated: display_name matches the profiles schema.
  function showApp() {
    $('#auth-screen').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');

    const name =
      profile?.display_name ||
      user?.user_metadata?.full_name ||
      user?.email?.split('@')[0] ||
      'Student';

    const initial = (name.trim()[0] || 'S').toUpperCase();
    const role = profile?.role || 'student';

    $('#sidebar-user-name').textContent = name;

    $('#sidebar-user-role').textContent =
      role === 'admin'
        ? 'Administrator account'
        : role === 'teacher'
          ? 'Teacher account'
          : 'Student account';

    $('#user-avatar').textContent = initial;
    $('#top-avatar').textContent = initial;
    $('#top-user-name').textContent = name;

    $('#welcome-title').innerHTML = `Good to see you <span>✦</span>`;

    // Admins can see the Teacher Studio navigation.
    $('#teacher-nav').classList.toggle(
      'hidden',
      !['teacher', 'admin'].includes(role)
    );

    $('#today-label').textContent = new Date().toLocaleDateString(
      undefined,
      { weekday: 'short', day: 'numeric', month: 'short' }
    );

    $('#footer-year').textContent = new Date().getFullYear();
  }

  // Updated: request only columns from the current profiles schema.
  async function getProfile() {
    if (!supabase || !user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id,display_name,role,teacher_approved')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Profile lookup failed:', error);
      return null;
    }

    return data;
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

    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;

    $('#auth-submit').disabled = true;
    $('#auth-message').textContent = '';

    try {
      if (!supabase) {
        $('#auth-message').textContent =
          'Connect Supabase first: edit SUPABASE_URL and SUPABASE_ANON_KEY in config.js.';
        return;
      }

      if (authMode === 'signup') {
        const full_name = $('#auth-name').value.trim();
        const requestedRole = $('#auth-role').value;

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name,
              requested_role: requestedRole
            }
          }
        });

        if (error) throw error;

        if (data.session) {
          user = data.user;
          profile = await getProfile();

          if (requestedRole === 'teacher' && profile?.role !== 'teacher') {
            toast('Account created. Teacher access awaits administrator approval.');
          }

          await startSession(data.user);
        } else {
          $('#auth-message').textContent =
            'Account created. Check your email to confirm, then sign in.';
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        await startSession(data.user);
        toast('Welcome back!');
      }
    } catch (err) {
      $('#auth-message').textContent =
        err.message || 'Could not authenticate. Please try again.';
    } finally {
      $('#auth-submit').disabled = false;
    }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();

    user = null;
    profile = null;
    tasks = [];
    assignments = [];

    showAuth('signin');
    closeSidebar();
  }

  // Updated: allow both teachers and admins to open Teacher Studio.
  function navigate(page) {
    if (
      page === 'teacher' &&
      !['teacher', 'admin'].includes(profile?.role)
    ) {
      page = 'dashboard';
      toast(
        'Teacher Studio is restricted to authorised teacher and admin accounts.',
        true
      );
    }

    currentPage = page;

    $$('.page').forEach(el =>
      el.classList.toggle('active', el.id === `page-${page}`)
    );

    $$('.nav-item[data-page]').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page)
    );

    const label = {
      dashboard: 'Overview',
      subjects: 'My subjects',
      tasks: 'Tasks & deadlines',
      quiz: 'Practice quiz',
      assistant: 'AI study buddy',
      teacher: 'Teacher studio'
    }[page] || 'Overview';

    $('#page-breadcrumb').textContent = label;

    closeSidebar();

    if (page === 'quiz') renderQuiz();

    if (page === 'assistant') {
      $('#chat-input').focus({ preventScroll: true });
    }

    if (page === 'teacher') renderTeacher();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#sidebar-scrim').classList.add('show');
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebar-scrim').classList.remove('show');
  }

  function renderSubjects() {
    const card = s => `
      <article class="subject-card">
        <div class="subject-card-top">
          <span class="subject-symbol ${s.color}">${s.icon}</span>
          <span class="eyebrow">SUBJECT</span>
        </div>
        <h3>${escapeHTML(s.name)}</h3>
        <p>${escapeHTML(s.desc)}</p>
        <div class="subject-card-bottom">
          <span>${escapeHTML(s.topics)}</span>
          <button class="subject-open" data-subject-task="${escapeHTML(s.name)}">
            View tasks →
          </button>
        </div>
      </article>`;

    $('#subjects-grid').innerHTML = subjects.map(card).join('');

    $('#dashboard-subjects').innerHTML = subjects.map(s => `
      <div class="subject-mini" data-subject-task="${escapeHTML(s.name)}">
        <span class="subject-symbol ${s.color}">${s.icon}</span>
        <div>
          <strong>${escapeHTML(s.name)}</strong>
          <small>${escapeHTML(s.topics.split(' · ')[0])} and more</small>
        </div>
      </div>`).join('');

    $('#stat-subjects').textContent = subjects.length;

    $('#task-subject').innerHTML = subjects
      .map(s => `<option>${escapeHTML(s.name)}</option>`)
      .join('');

    $('#assignment-subject').innerHTML = subjects
      .map(s => `<option>${escapeHTML(s.name)}</option>`)
      .join('');
  }

  function localLoad() {
    try {
      return JSON.parse(localStorage.getItem(localKey()) || '[]');
    } catch {
      return [];
    }
  }

  async function loadTasks() {
    if (supabase && user) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error) {
        tasks = (data || []).map(t => ({
          id: t.id,
          title: t.title,
          subject: t.subject,
          due: t.due_date,
          priority: t.priority || 'normal',
          completed: t.completed
        }));

        return;
      }

      console.error(error);
      toast('Could not sync tasks. Showing locally saved tasks.', true);
    }

    tasks = localLoad();
  }

  async function persistTask(task, operation = 'insert') {
    if (supabase && user) {
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
      } else if (operation === 'update') {
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
      } else {
        const { error } = await supabase
          .from('tasks')
          .delete()
          .eq('id', task.id)
          .eq('user_id', user.id);

        if (error) throw error;
      }
    } else {
      localStorage.setItem(localKey(), JSON.stringify(tasks));
    }
  }

  async function addTask(event) {
    event.preventDefault();

    const task = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title: $('#task-title').value.trim(),
      subject: $('#task-subject').value,
      due: $('#task-due').value,
      priority: $('#task-priority').value,
      completed: false
    };

    if (!task.title) return;

    tasks.unshift(task);

    try {
      await persistTask(task, 'insert');

      if (!supabase || !user) {
        localStorage.setItem(localKey(), JSON.stringify(tasks));
      }

      $('#task-form').reset();
      $('#task-form-panel').classList.add('hidden');

      renderAll();
      toast('Task added. Keep going!');
    } catch (err) {
      tasks = tasks.filter(t => t.id !== task.id);
      toast(`Could not save task: ${err.message}`, true);
    }
  }

  async function toggleTask(id) {
    const t = tasks.find(x => String(x.id) === String(id));
    if (!t) return;

    t.completed = !t.completed;
    renderAll();

    try {
      await persistTask(t, 'update');

      if (!supabase || !user) {
        localStorage.setItem(localKey(), JSON.stringify(tasks));
      }
    } catch (err) {
      t.completed = !t.completed;
      renderAll();
      toast('Could not update task.', true);
    }
  }

  async function deleteTask(id) {
    const t = tasks.find(x => String(x.id) === String(id));
    if (!t) return;

    tasks = tasks.filter(x => String(x.id) !== String(id));
    renderAll();

    try {
      await persistTask(t, 'delete');

      if (!supabase || !user) {
        localStorage.setItem(localKey(), JSON.stringify(tasks));
      }

      toast('Task removed.');
    } catch (err) {
      tasks.push(t);
      renderAll();
      toast('Could not delete task.', true);
    }
  }

  function taskHTML(t, compact = false) {
    return `
      <div class="${compact ? 'compact-task' : 'task-row'} ${t.completed ? 'completed' : ''}">
        <button
          class="task-check ${t.completed ? 'checked' : ''}"
          data-toggle-task="${escapeHTML(t.id)}"
          aria-label="${t.completed ? 'Mark incomplete' : 'Mark complete'}"
        >${t.completed ? '✓' : ''}</button>
        <div class="task-main">
          <strong>${escapeHTML(t.title)}</strong>
          <small>
            ${escapeHTML(t.subject)}
            ${compact ? '' : `<span class="priority ${escapeHTML(t.priority || 'normal')}">${escapeHTML(t.priority || 'normal')} priority</span>`}
          </small>
        </div>
        <span class="task-due">${escapeHTML(dateText(t.due))}</span>
        ${compact ? '' : `
          <div class="task-row-actions">
            <button
              class="delete-task"
              data-delete-task="${escapeHTML(t.id)}"
              aria-label="Delete task"
              title="Delete task"
            >✕</button>
          </div>`}
      </div>`;
  }

  function renderTasks() {
    const pending = tasks.filter(t => !t.completed);
    const done = tasks.filter(t => t.completed);

    $('#stat-pending').textContent = pending.length;
    $('#stat-completed').textContent = done.length;
    $('#task-nav-count').textContent = pending.length;

    const total = tasks.length;
    const percent = total ? Math.round(done.length / total * 100) : 0;

    $('#progress-percent').textContent = `${percent}%`;
    $('#progress-fill').style.width = `${percent}%`;

    $('#progress-caption').textContent = total
      ? `${done.length} of ${total} tasks completed. ${percent === 100 ? 'Amazing work — you did it!' : 'Every completed task is progress.'}`
      : 'Complete a task to start your progress journey.';

    $('#progress-percent').setAttribute('aria-label', `${percent}% completed`);

    $('#dashboard-tasks').innerHTML = pending
      .slice()
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
      .slice(0, 4)
      .map(t => taskHTML(t, true))
      .join('') ||
      `<div class="empty-state">
        <div class="empty-icon">✦</div>
        <h3>All clear for now</h3>
        <p>Add a task when you are ready for your next step.</p>
      </div>`;

    const shown = tasks.filter(t =>
      filter === 'all' ||
      (filter === 'pending' && !t.completed) ||
      (filter === 'completed' && t.completed)
    );

    shown.sort((a, b) => Number(a.completed) - Number(b.completed));

    $('#task-list').innerHTML = shown.map(t => taskHTML(t)).join('') ||
      `<div class="empty-state panel">
        <div class="empty-icon">✦</div>
        <h3>${filter === 'completed' ? 'No completed tasks yet' : 'Nothing on your list'}</h3>
        <p>${filter === 'pending' ? 'You have no pending tasks. Enjoy the breathing room.' : 'Add a task to turn your goals into small steps.'}</p>
        <button class="btn btn-primary" data-open-task style="margin-top:15px">＋ Add a task</button>
      </div>`;

    $('#task-list-count').textContent =
      `${shown.length} task${shown.length === 1 ? '' : 's'}`;
  }

  function renderStats() {
    const score = bestScore ? `${bestScore}%` : '—';
    $('#stat-score').textContent = score;
    $('#quiz-best-label').textContent = score;
  }

  function renderAll() {
    renderSubjects();
    renderTasks();
    renderStats();
  }

  function startQuiz() {
    quizIndex = 0;
    quizScore = 0;
    quizChoice = null;
    quizChecked = false;
    quizAnswers = [];

    $('#quiz-content').classList.remove('hidden');
    $('#quiz-result').classList.add('hidden');

    renderQuiz();
  }

  function renderQuiz() {
    if (quizIndex >= questions.length) {
      finishQuiz();
      return;
    }

    const q = questions[quizIndex];

    $('#quiz-step-label').textContent =
      `QUESTION ${quizIndex + 1} OF ${questions.length}`;

    $('#quiz-progress-label').textContent =
      `${Math.round(quizIndex / questions.length * 100)}% complete`;

    $('#quiz-progress-fill').style.width =
      `${quizIndex / questions.length * 100}%`;

    $('#quiz-question-area').innerHTML = `
      <h2 class="quiz-question">${escapeHTML(q.q)}</h2>
      <div class="quiz-options">
        ${q.options.map((o, i) => `
          <button
            class="quiz-option ${quizChoice === i ? 'selected' : ''} ${quizChecked && i === q.answer ? 'correct' : ''} ${quizChecked && quizChoice === i && i !== q.answer ? 'incorrect' : ''}"
            data-quiz-option="${i}"
            ${quizChecked ? 'disabled' : ''}
          >
            <span class="option-letter">${String.fromCharCode(65 + i)}</span>
            <span>${escapeHTML(o)}</span>
          </button>`).join('')}
      </div>
      ${quizChecked ? `
        <div class="quiz-feedback ${quizChoice === q.answer ? 'good' : 'bad'}">
          ${quizChoice === q.answer ? 'Correct! ' : `Not quite. The answer is ${escapeHTML(q.options[q.answer])}. `}
          ${escapeHTML(q.explain)}
        </div>` : ''}`;

    $('#quiz-next').disabled = quizChoice === null;
    $('#quiz-next').textContent = quizChecked
      ? (quizIndex === questions.length - 1 ? 'See my results →' : 'Next question →')
      : 'Check answer →';

    $('#quiz-total-label').textContent = questions.length;
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
    const percent = Math.round(quizScore / questions.length * 100);

    bestScore = Math.max(bestScore, percent);
    localStorage.setItem('learnhub-best-score', String(bestScore));

    $('#quiz-content').classList.add('hidden');
    $('#quiz-result').classList.remove('hidden');

    $('#quiz-result').innerHTML = `
      <div class="result-icon">${percent >= 80 ? '✦' : '✧'}</div>
      <span class="eyebrow">QUIZ COMPLETE</span>
      <h2>${percent >= 80 ? 'Brilliant effort!' : percent >= 50 ? 'Good progress!' : 'Keep practising!'}</h2>
      <div class="result-score">${percent}%</div>
      <p>You answered ${quizScore} out of ${questions.length} questions correctly.</p>
      <p>${percent >= 80 ? 'You are building strong understanding. Keep challenging yourself.' : 'Review the explanations and give it another try. Learning is a process.'}</p>
      <button id="quiz-restart" class="btn btn-primary">Try again ↻</button>`;

    $('#quiz-best-label').textContent = `${bestScore}%`;
    renderStats();

    if (supabase && user) {
      supabase.from('quiz_results').insert({
        user_id: user.id,
        quiz_key: 'general-foundations-v1',
        score: quizScore,
        total_questions: questions.length,
        percentage: percent,
        answers: quizAnswers
      }).then(({ error }) => {
        if (error) console.warn('Quiz result was not synced:', error.message);
      });
    }
  }

  function addMessage(text, role) {
    const wrap = document.createElement('div');
    wrap.className = `chat-message ${role === 'user' ? 'user-message' : 'assistant-message'}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user'
      ? (profile?.display_name?.[0] || user?.user_metadata?.full_name?.[0] || 'S')
      : '✧';

    const body = document.createElement('div');
    body.className = 'message-body';

    const strong = document.createElement('strong');
    strong.textContent = role === 'user' ? 'You' : 'Study buddy';

    const p = document.createElement('p');
    p.textContent = text;

    body.append(strong, p);
    wrap.append(avatar, body);

    $('#chat-messages').append(wrap);
    $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;

    return p;
  }

  async function sendChat(event) {
    event.preventDefault();

    const input = $('#chat-input');
    const question = input.value.trim();

    if (!question) return;

    input.value = '';
    addMessage(question, 'user');

    const placeholder = addMessage('Thinking through that with you…', 'assistant');
    const send = $('.send-btn');

    send.disabled = true;

    try {
      if (!supabase || !user) {
        throw new Error('Sign in with a configured Supabase project to use the AI study assistant.');
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch(cfg.AI_ENDPOINT || '/api/study-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          question,
          history: chatHistory.slice(-8)
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Assistant request failed (${response.status}).`);
      }

      placeholder.textContent =
        data.answer || 'I could not generate an answer. Please try again.';

      chatHistory.push(
        { role: 'user', content: question },
        { role: 'assistant', content: placeholder.textContent }
      );
    } catch (err) {
      placeholder.textContent =
        err.message || 'Something went wrong. Please try again.';

      toast('Study buddy could not respond.', true);
    } finally {
      send.disabled = false;
      $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
    }
  }

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

  // Updated: admin accounts can access Teacher Studio too.
  async function renderTeacher() {
    const isTeacher = ['teacher', 'admin'].includes(profile?.role);

    $('#teacher-denied').classList.toggle('hidden', isTeacher);
    $('#teacher-content').classList.toggle('hidden', !isTeacher);

    if (!isTeacher) return;

    await loadAssignments();

    $('#teacher-assignment-count').textContent =
      assignments.filter(a => a.teacher_id === user.id).length;

    const myAssignmentIds = assignments
      .filter(a => a.teacher_id === user.id)
      .map(a => a.id);

    const { count } = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .in(
        'assignment_id',
        myAssignmentIds.length
          ? myAssignmentIds
          : ['00000000-0000-0000-0000-000000000000']
      );

    $('#teacher-submission-count').textContent = count || 0;

    const mine = assignments.filter(a => a.teacher_id === user.id);

    $('#teacher-assignments').innerHTML = mine.map(a => `
      <article class="assignment-card">
        <h4>${escapeHTML(a.title)}</h4>
        <p>${escapeHTML(a.description)}</p>
        <div class="assignment-meta">
          <span>${escapeHTML(a.subject)}</span>
          <span>Due: ${escapeHTML(dateText(a.due_date))}</span>
          <span>Published ${escapeHTML(dateText(a.created_at?.slice(0, 10)))}</span>
        </div>
      </article>`).join('') ||
      `<div class="empty-state">
        <div class="empty-icon">✦</div>
        <h3>Your classroom starts here</h3>
        <p>Create your first assignment to share clear next steps with your students.</p>
      </div>`;
  }

  async function createAssignment(event) {
    event.preventDefault();

    if (
      !['teacher', 'admin'].includes(profile?.role) ||
      !supabase
    ) {
      return toast('Teacher or admin access and database setup are required.', true);
    }

    const assignment = {
      teacher_id: user.id,
      title: $('#assignment-title').value.trim(),
      subject: $('#assignment-subject').value,
      description: $('#assignment-description').value.trim(),
      due_date: $('#assignment-due').value || null
    };

    try {
      const { error } = await supabase
        .from('assignments')
        .insert(assignment);

      if (error) throw error;

      $('#assignment-form').reset();
      $('#assignment-form-panel').classList.add('hidden');

      await renderTeacher();
      toast('Assignment published.');
    } catch (err) {
      toast(`Could not publish assignment: ${err.message}`, true);
    }
  }

  function bind() {
    $('#auth-form').addEventListener('submit', handleAuth);

    $('#auth-switch').addEventListener('click', () =>
      showAuth(authMode === 'signin' ? 'signup' : 'signin')
    );

    $('#signout-btn').addEventListener('click', signOut);

    $('#theme-toggle').addEventListener('click', () =>
      setTheme(document.body.classList.contains('dark') ? 'light' : 'dark')
    );

    $('#menu-toggle').addEventListener('click', openSidebar);
    $('#sidebar-close').addEventListener('click', closeSidebar);
    $('#sidebar-scrim').addEventListener('click', closeSidebar);

    $$('.nav-item[data-page]').forEach(b =>
      b.addEventListener('click', () => navigate(b.dataset.page))
    );

    $$('[data-go]').forEach(b =>
      b.addEventListener('click', () => navigate(b.dataset.go))
    );

    $('#top-user').addEventListener('click', () =>
      showModal(
        'Your account',
        `${profile?.display_name || user?.user_metadata?.full_name || user?.email || 'Student'} · ${profile?.role || 'student'} account\nUse the sign-out icon at the bottom of the sidebar to end your session.`
      )
    );

    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-ok').addEventListener('click', closeModal);

    $('#modal-overlay').addEventListener('click', e => {
      if (e.target === $('#modal-overlay')) closeModal();
    });

    $('#task-form').addEventListener('submit', addTask);

    $('#add-task-open').addEventListener('click', () =>
      $('#task-form-panel').classList.remove('hidden')
    );

    $('#task-form-close').addEventListener('click', () =>
      $('#task-form-panel').classList.add('hidden')
    );

    $('#task-cancel').addEventListener('click', () =>
      $('#task-form-panel').classList.add('hidden')
    );

    $('#task-filter-tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;

      filter = b.dataset.filter;

      $$('.filter-tab').forEach(x =>
        x.classList.toggle('active', x === b)
      );

      renderTasks();
    });

    document.addEventListener('click', e => {
      const toggle = e.target.closest('[data-toggle-task]');
      if (toggle) toggleTask(toggle.dataset.toggleTask);

      const del = e.target.closest('[data-delete-task]');
      if (del) deleteTask(del.dataset.deleteTask);

      const open = e.target.closest('[data-open-task]');
      if (open) {
        $('#task-form-panel').classList.remove('hidden');
        $('#task-title').focus();
      }

      const subject = e.target.closest('[data-subject-task]');
      if (subject) {
        $('#task-subject').value = subject.dataset.subjectTask;
        navigate('tasks');
        $('#task-form-panel').classList.remove('hidden');
      }
    });

    $('#quiz-question-area').addEventListener('click', e => {
      const b = e.target.closest('[data-quiz-option]');
      if (b) chooseQuiz(Number(b.dataset.quizOption));
    });

    $('#quiz-next').addEventListener('click', checkQuiz);

    $('#quiz-result').addEventListener('click', e => {
      if (e.target.closest('#quiz-restart')) startQuiz();
    });

    $('#chat-form').addEventListener('submit', sendChat);

    $$('[data-prompt]').forEach(b =>
      b.addEventListener('click', () => {
        $('#chat-input').value = b.dataset.prompt;
        $('#chat-input').focus();
      })
    );

    $('#assignment-open').addEventListener('click', () =>
      $('#assignment-form-panel').classList.remove('hidden')
    );

    $('#assignment-close').addEventListener('click', () =>
      $('#assignment-form-panel').classList.add('hidden')
    );

    $('#assignment-form').addEventListener('submit', createAssignment);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeSidebar();
        closeModal();
      }
    });
  }

  async function init() {
    setTheme(localStorage.getItem('learnhub-theme') || 'light');

    bind();
    renderSubjects();
    renderStats();

    $('#today-label').textContent = new Date().toLocaleDateString(
      undefined,
      { weekday: 'short', day: 'numeric', month: 'short' }
    );

    $('#footer-year').textContent = new Date().getFullYear();

    if (!supabase) {
      user = null;
      profile = null;
      tasks = localLoad();

      showAuth('signin');

      $('#auth-message').textContent =
        'Demo mode: configure Supabase in config.js to enable secure accounts, cloud sync and AI.';

      return;
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      await startSession(session.user);
    } else {
      showAuth('signin');
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        user = null;
        profile = null;
        showAuth('signin');
      } else if (session && (!user || user.id !== session.user.id)) {
        setTimeout(() => startSession(session.user), 0);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
