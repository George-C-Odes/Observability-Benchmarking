(function(){
  const debounce = (fn, wait=100)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };

  function redistributeNav(){
    const nav = document.querySelector('.nav');
    if(!nav) return;
    const navLinks = nav.querySelector('.nav-links');
    if(!navLinks) return;
    const moreLi = navLinks.querySelector('.nav-more');
    const moreMenu = moreLi ? moreLi.querySelector('.dropdown-menu') : null;
    const logo = nav.querySelector('.logo');
    if(!navLinks || !moreLi || !moreMenu || !logo) return;

    // move everything back from moreMenu into navLinks (before .nav-more)
    while(moreMenu.firstChild){
      navLinks.insertBefore(moreMenu.firstChild, moreLi);
    }
    moreLi.hidden = true;
    moreLi.querySelector('.more-btn').setAttribute('aria-expanded','false');
    moreLi.classList.remove('is-open');

    // compute available width for links (nav width minus logo and some padding)
    const navStyle = getComputedStyle(nav);
    const navPaddingLeft = Number.parseFloat(navStyle.paddingLeft) || 0;
    const navPaddingRight = Number.parseFloat(navStyle.paddingRight) || 0;
    const available = nav.clientWidth - logo.offsetWidth - navPaddingLeft - navPaddingRight - 24; // safety buffer

    // accumulate widths and move overflow items
    let total = 0;
    const items = Array.from(navLinks.children).filter(li=>!li.classList.contains('nav-more'));
    for(let i=0;i<items.length;i++){
      const li = items[i];
      total += li.offsetWidth;
      if(total > available){
        // move this and subsequent items into moreMenu
        for(let j=i;j<items.length;j++){
          moreMenu.appendChild(items[j]);
        }
        moreLi.hidden = false;
        break;
      }
    }

    // hide More if empty
    if(!moreMenu.children.length) moreLi.hidden = true;
  }

  // toggle dropdown on button click
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.more-btn');
    if(!btn) return;
    const moreLi = btn.closest('.nav-more');
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    moreLi.classList.toggle('is-open', !expanded);
  });

  // close dropdown on outside click
  document.addEventListener('click', function(e){
    if(e.target.closest('.nav-more')) return;
    document.querySelectorAll('.nav-more').forEach(m=>m.classList.remove('is-open'));
    document.querySelectorAll('.more-btn').forEach(b=>b.setAttribute('aria-expanded','false'));
  });

  // run on load and resize
  window.addEventListener('load', redistributeNav);
  window.addEventListener('resize', debounce(redistributeNav, 120));

  // also run after images/fonts load via DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(redistributeNav, 50); });
})();
