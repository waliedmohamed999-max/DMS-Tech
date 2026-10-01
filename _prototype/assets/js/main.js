(function () {
  if (window.lucide) lucide.createIcons();

  var WA_NUMBER = '966509095816';
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');
  var mobile = window.matchMedia('(max-width: 980px)');

  // Sticky nav shadow
  var onScroll = function () { nav.classList.toggle('is-stuck', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  // Dropdowns: hover on desktop, tap on mobile
  var items = document.querySelectorAll('.nav__item.has-dd');
  var closeAll = function (except) {
    items.forEach(function (it) {
      if (it !== except) {
        it.classList.remove('is-open');
        it.querySelector('.nav__link').setAttribute('aria-expanded', 'false');
      }
    });
  };
  items.forEach(function (item) {
    var btn = item.querySelector('.nav__link');
    var timer;
    item.addEventListener('mouseenter', function () {
      if (mobile.matches) return;
      clearTimeout(timer); closeAll(item);
      item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
    });
    item.addEventListener('mouseleave', function () {
      if (mobile.matches) return;
      timer = setTimeout(function () { item.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }, 120);
    });
    btn.addEventListener('click', function () {
      var open = !item.classList.contains('is-open');
      closeAll(item);
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open);
    });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.nav__item.has-dd')) closeAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  // Close mobile menu after following a link
  document.querySelectorAll('.nav__menu a').forEach(function (a) {
    a.addEventListener('click', function () {
      closeAll();
      if (nav.classList.contains('is-open')) toggle.click();
    });
  });

  // Reveal on scroll
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  // Forms → WhatsApp with a prefilled message
  var openWhatsApp = function (lines) {
    var text = encodeURIComponent(lines.filter(Boolean).join('\n'));
    window.open('https://wa.me/' + WA_NUMBER + '?text=' + text, '_blank', 'noopener');
  };

  var quote = document.getElementById('quote');
  quote.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = quote.elements;
    var note = document.getElementById('formNote');
    if (!f.name.value.trim() || !f.phone.value.trim()) {
      note.textContent = 'من فضلك أدخل الاسم ورقم الجوال.';
      note.style.color = '#b42318';
      (f.name.value.trim() ? f.phone : f.name).focus();
      return;
    }
    note.textContent = 'سيتم فتح واتساب برسالة جاهزة تحتوي على بياناتك.';
    note.style.color = '';
    openWhatsApp([
      'طلب عرض سعر — DMS Tech',
      'الاسم: ' + f.name.value.trim(),
      'الجوال: ' + f.phone.value.trim(),
      f.company.value.trim() && 'الشركة: ' + f.company.value.trim(),
      'الخدمة: ' + f.service.value,
      f.message.value.trim() && 'التفاصيل: ' + f.message.value.trim()
    ]);
  });

  var cta = document.getElementById('ctaForm');
  cta.addEventListener('submit', function (e) {
    e.preventDefault();
    var phone = cta.elements.phone.value.trim();
    if (!phone) { cta.elements.phone.focus(); return; }
    openWhatsApp(['مرحباً DMS Tech، أرغب في الحصول على عرض سعر.', 'رقم الجوال: ' + phone]);
  });

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
